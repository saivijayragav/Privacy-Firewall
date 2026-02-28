from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from app.domain.contracts import ProcessOptions
from app.domain.models import (
    AuditEvent,
    DetectedEntity,
    FlaggedEntity,
    LocationReference,
    ManualRegion,
    MediaType,
    ProcessingResponse,
    RedactionPlan,
    RedactionRegion,
    ScanResponse,
)
from app.services.contextual import ContextualIntelligenceService
from app.services.decisioning import DecisionEngine, RiskScoringService
from app.services.detectors import EntityDetector, _build_segment_offset_map, map_bbox_by_offset
from app.services.extractors import ExtractionOutput, SignalExtractor
from app.services.object_store import R2ObjectStore
from app.services.redaction import RedactionService
from app.services.scan_store import ScanResult, ScanStore


class PrivacyFirewallPipeline:
    def __init__(
        self,
        extractor: SignalExtractor,
        detector: EntityDetector,
        contextual: ContextualIntelligenceService,
        scorer: RiskScoringService,
        decision_engine: DecisionEngine,
        redaction: RedactionService,
        output_dir: Path,
        scan_store: ScanStore | None = None,
        object_store: R2ObjectStore | None = None,
    ) -> None:
        self.extractor = extractor
        self.detector = detector
        self.contextual = contextual
        self.scorer = scorer
        self.decision_engine = decision_engine
        self.redaction = redaction
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.scan_store = scan_store or ScanStore()
        self.object_store = object_store or R2ObjectStore(None, None, None)

    async def process_document(self, file_path: Path, options: ProcessOptions) -> ProcessingResponse:
        extraction = self.extractor.extract_document(file_path)
        return await self._process(extraction, MediaType.DOCUMENT, options)

    async def process_image(self, file_path: Path, options: ProcessOptions) -> ProcessingResponse:
        extraction = self.extractor.extract_image(file_path)
        return await self._process(extraction, MediaType.IMAGE, options)

    async def process_audio(self, file_path: Path, options: ProcessOptions) -> ProcessingResponse:
        extraction = self.extractor.extract_audio(file_path)
        return await self._process(extraction, MediaType.AUDIO, options)

    # ────────────────────────────────────────────────────────────────
    # Two-phase: Scan (detection only, no file mutation)
    # ────────────────────────────────────────────────────────────────

    async def scan_document(self, file_path: Path, *, use_llm: bool = True) -> ScanResponse:
        extraction = self.extractor.extract_document(file_path)
        return await self._scan(extraction, MediaType.DOCUMENT, use_llm=use_llm)

    async def scan_image(self, file_path: Path, *, use_llm: bool = True) -> ScanResponse:
        extraction = self.extractor.extract_image(file_path)
        return await self._scan(extraction, MediaType.IMAGE, use_llm=use_llm)

    async def scan_audio(self, file_path: Path, *, use_llm: bool = True) -> ScanResponse:
        extraction = self.extractor.extract_audio(file_path)
        return await self._scan(extraction, MediaType.AUDIO, use_llm=use_llm)

    async def _scan(self, extraction: ExtractionOutput, media_type: MediaType, *, use_llm: bool = True) -> ScanResponse:
        """Run the full detection + classification pipeline but do NOT redact."""
        audit_log, reasoning_trace, flagged, risk_score, warning_message = await self._detect_and_classify(
            extraction, media_type, use_llm=use_llm,
        )

        recommended_plan = (
            self.redaction.plan(media_type, [f.detected for f in flagged]) if flagged else None
        )

        scan_id = uuid4().hex
        self.scan_store.put(ScanResult(
            scan_id=scan_id,
            media_type=media_type,
            extraction=extraction,
            flagged_entities=flagged,
            risk_score=risk_score,
            warning_message=warning_message,
            recommended_plan=recommended_plan,
            audit_log=audit_log,
            reasoning_trace=reasoning_trace,
        ))

        return ScanResponse(
            scan_id=scan_id,
            flagged_entities=flagged,
            risk_score=risk_score,
            warning_message=warning_message,
            recommended_redaction_plan=recommended_plan,
            audit_log=audit_log,
            reasoning_trace=reasoning_trace,
        )

    # ────────────────────────────────────────────────────────────────
    # Two-phase: Redact from a previous scan
    # ────────────────────────────────────────────────────────────────

    def redact_from_scan(
        self,
        scan: ScanResult,
        approved_ids: list[str],
        manual_regions: list[ManualRegion] | None = None,
    ) -> tuple[Path | None, dict, str | None]:
        """Build a filtered redaction plan and execute it.

        Returns (output_path, report, r2_object_key).
        """
        plan = scan.recommended_plan
        if plan is None:
            plan = RedactionPlan(
                redaction_regions=[],
                audio_timestamps=[],
                strategy_type="hybrid",
                reversible_reference_id=uuid4().hex,
            )

        # Filter to only approved regions
        approved_set = set(approved_ids)
        if approved_set:
            plan = RedactionPlan(
                redaction_regions=[r for r in plan.redaction_regions if r.entity_id in approved_set],
                audio_timestamps=plan.audio_timestamps,  # keep audio as-is if approved
                strategy_type=plan.strategy_type,
                reversible_reference_id=plan.reversible_reference_id,
            )

        # Append manual (user-drawn) regions
        if manual_regions:
            for mr in manual_regions:
                plan.redaction_regions.append(
                    RedactionRegion(
                        entity_id=uuid4().hex,
                        media_type=scan.media_type,
                        location_reference=LocationReference(
                            page=mr.page,
                            bbox=mr.bbox,
                        ),
                        strategy_type="blackout",
                    )
                )

        if not plan.redaction_regions and not plan.audio_timestamps:
            return None, {"status": "nothing_to_redact"}, None

        output_path, report = self.redaction.execute(
            scan.media_type,
            scan.extraction.temp_file_path,
            self.output_dir,
            plan,
        )

        # Upload to R2 if available
        r2_key: str | None = None
        if output_path and output_path.exists():
            r2_key = self.object_store.upload(
                output_path, scan_id=scan.scan_id,
            )

        return output_path, report, r2_key

    # ────────────────────────────────────────────────────────────────
    # Two-phase: Detect entities in a user-drawn crop region
    # ────────────────────────────────────────────────────────────────

    def detect_in_region(
        self,
        scan: ScanResult,
        bbox: list[float],
        page: int = 1,
    ) -> list[DetectedEntity]:
        """Crop image to *bbox*, run OCR + entity detection on the crop."""
        import cv2
        import numpy as np

        src = scan.extraction.temp_file_path
        image = cv2.imread(str(src))
        if image is None:
            return []

        x0, y0, x1, y1 = [int(v) for v in bbox]
        h, w = image.shape[:2]
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(w, x1), min(h, y1)
        if x1 <= x0 or y1 <= y0:
            return []

        crop = image[y0:y1, x0:x1]

        # Write crop to temp file and run extraction
        crop_path = src.parent / f"crop_{uuid4().hex}.png"
        cv2.imwrite(str(crop_path), crop)

        try:
            crop_extraction = self.extractor.extract_image(crop_path)
            entities = self.detector.detect(
                crop_extraction.text_segments,
                crop_extraction.bounding_boxes,
                crop_extraction.timestamps,
            )
            # Offset bboxes back to original image coordinates
            for ent in entities:
                if ent.location_reference.bbox:
                    eb = ent.location_reference.bbox
                    ent.location_reference.bbox = [
                        eb[0] + x0, eb[1] + y0, eb[2] + x0, eb[3] + y0,
                    ]
                    ent.location_reference.page = page
            return entities
        finally:
            crop_path.unlink(missing_ok=True)

    async def _process(self, extraction, media_type: MediaType, options: ProcessOptions) -> ProcessingResponse:
        audit_log, reasoning_trace, flagged, risk_score, warning_message = await self._detect_and_classify(
            extraction, media_type, use_llm=options.use_llm,
        )

        should_redact = self.decision_engine.should_redact(
            mode=options.mode,
            risk_score=risk_score,
            threshold=options.score_threshold,
            policy=options.policy,
            flagged_types=[item.detected.type.lower() for item in flagged],
        )
        audit_log.append(AuditEvent(stage="decision", details={"should_redact": should_redact, "mode": options.mode.value}))

        recommended_plan = self.redaction.plan(media_type, [item.detected for item in flagged]) if flagged else None
        output_file_path: str | None = None
        redaction_report: dict | None = None
        r2_key: str | None = None
        r2_url: str | None = None

        if should_redact and recommended_plan and (options.apply_redaction or options.mode.value in {"auto_redact", "policy"}):
            out, report = self.redaction.execute(media_type, extraction.temp_file_path, self.output_dir, recommended_plan)
            redaction_report = report
            output_file_path = str(out) if out else None
            audit_log.append(AuditEvent(stage="redaction_execution", details=report))

            # Upload to R2 if available
            if out and out.exists():
                r2_key = self.object_store.upload(out)
                if r2_key:
                    r2_url = self.object_store.presigned_url(r2_key)

        return ProcessingResponse(
            mode_used=options.mode,
            flagged_entities=flagged,
            risk_score=risk_score,
            warning_message=warning_message,
            recommended_redaction_plan=recommended_plan if options.mode.value in {"warn", "policy", "auto_redact"} else None,
            redaction_report=redaction_report,
            audit_log=audit_log,
            reasoning_trace=reasoning_trace,
            output_file_path=output_file_path,
            object_store_key=r2_key if r2_key else None,
            download_url=r2_url if r2_url else None,
        )

    async def _detect_and_classify(
        self, extraction: ExtractionOutput, media_type: MediaType, *, use_llm: bool = True,
    ) -> tuple[list[AuditEvent], list[str], list[FlaggedEntity], float, str | None]:
        """Shared detection + classification logic used by both _process and _scan."""
        audit_log: list[AuditEvent] = []
        reasoning_trace: list[str] = []

        full_text = "\n".join(seg.get("text", "") for seg in extraction.text_segments)
        entities = self.detector.detect(extraction.text_segments, extraction.bounding_boxes, extraction.timestamps)
        audit_log.append(AuditEvent(stage="entity_detection", details={"count": len(entities)}))

        # ---- Inject face detections as synthetic entities so they are redacted ----
        if extraction.faces:
            for face in extraction.faces:
                bbox = face.get("bbox")
                page_num = face.get("page", 1)
                if bbox:
                    entities.append(
                        DetectedEntity(
                            entity_id=uuid4().hex,
                            type="face",
                            raw_value="[face]",
                            location_reference=LocationReference(page=page_num, bbox=bbox),
                            confidence_score=0.90,
                        )
                    )
            audit_log.append(AuditEvent(stage="face_detection", details={"count": len(extraction.faces)}))

        # ---- Inject QR code regions as synthetic entities so they are redacted ----
        if extraction.objects:
            qr_count = 0
            for obj in extraction.objects:
                if obj.get("type") == "qr_code":
                    bbox = obj.get("bbox")
                    page_num = obj.get("page", 1)
                    if bbox:
                        entities.append(
                            DetectedEntity(
                                entity_id=uuid4().hex,
                                type="qr_code",
                                raw_value="[qr_code]",
                                location_reference=LocationReference(page=page_num, bbox=bbox),
                                confidence_score=0.95,
                            )
                        )
                        qr_count += 1
            if qr_count:
                audit_log.append(AuditEvent(stage="qr_code_detection", details={"count": qr_count}))

        # ---- LLM catch-all: discover PII missed by regex/Presidio ----
        if use_llm:
            already_found_values = [e.raw_value for e in entities]
            llm_extra = await self.contextual.discover_additional_pii(full_text, already_found_values)
            if llm_extra:
                if media_type == MediaType.AUDIO:
                    # Map audio timestamps for LLM generic detections
                    for ent in llm_extra:
                        for segment in extraction.timestamps:
                            if ent.raw_value and ent.raw_value.lower() in segment.get("text", "").lower():
                                ent.location_reference.start_sec = segment.get("start_sec")
                                ent.location_reference.end_sec = segment.get("end_sec")
                                break
                else:
                    # Build offset maps per page so LLM entities get correct bboxes
                    llm_pages: set[int] = {(ent.location_reference.page or 1) for ent in llm_extra}
                    llm_offset_maps: dict[int, list[tuple[int, int, int]]] = {}
                    for pg in llm_pages:
                        _, omap = _build_segment_offset_map(
                            extraction.text_segments, extraction.bounding_boxes, pg,
                        )
                        llm_offset_maps[pg] = omap
                    for ent in llm_extra:
                        pg = ent.location_reference.page or 1
                        map_bbox_by_offset(ent, llm_offset_maps.get(pg, []), extraction.bounding_boxes)
                entities.extend(llm_extra)
                audit_log.append(AuditEvent(stage="llm_pii_discovery", details={"additional_count": len(llm_extra)}))

        # ---- Entity propagation: find detected values in additional bboxes/timestamps ----
        propagated = self._propagate_entities(entities, extraction.bounding_boxes, extraction.timestamps)
        if propagated:
            entities.extend(propagated)
            audit_log.append(AuditEvent(stage="entity_propagation", details={"additional_count": len(propagated)}))

        contextual = await self.contextual.classify(entities, full_text, use_llm=use_llm)
        audit_log.append(AuditEvent(stage="contextual_classification", details={"count": len(contextual)}))

        eval_by_id = {item.entity_id: item for item in contextual}
        flagged = [
            FlaggedEntity(detected=entity, contextual=eval_by_id[entity.entity_id])
            for entity in entities
            if entity.entity_id in eval_by_id and eval_by_id[entity.entity_id].is_sensitive
        ]

        risk_score = self.scorer.compute_score([item.contextual for item in flagged])
        audit_log.append(AuditEvent(stage="risk_scoring", details={"risk_score": risk_score}))

        for item in flagged:
            reasoning_trace.append(f"{item.detected.type}: {item.contextual.reasoning}")

        warning_message = None
        if risk_score >= 0.7:
            warning_message = "High privacy risk detected. Review before sharing."
        elif risk_score >= 0.4:
            warning_message = "Moderate privacy risk detected. Redaction recommended."

        return audit_log, reasoning_trace, flagged, risk_score, warning_message

    @staticmethod
    def _propagate_entities(
        entities: list[DetectedEntity],
        bounding_boxes: list[dict],
        timestamps: list[dict] | None = None,
    ) -> list[DetectedEntity]:
        """Find additional bbox or timestamp locations for already-detected entity values.

        Handles:
        - Exact value matches in bounding box or timestamp texts not yet covered
        - PAN prefix matching for OCR error tolerance (last char)
        """
        if not entities or (not bounding_boxes and not timestamps):
            return []

        # Types worth propagating across the document
        propagatable = {
            "pan", "aadhaar", "aadhaar_vid", "aadhaar_enrolment",
            "person", "llm_name", "parent_name", "date_of_birth",
            "credit_card", "passport", "driving_license",
        }

        values_to_type: dict[str, str] = {}  # value -> type
        pan_prefixes: dict[str, str] = {}    # 9-char prefix -> full PAN value

        for ent in entities:
            etype = ent.type.lower()
            if etype in propagatable or etype.startswith("llm_"):
                val = ent.raw_value.strip()
                if val and len(val) > 3:
                    values_to_type[val] = etype
                # For PAN, store 9-char prefix for fuzzy match (handles OCR
                # misread of last character, e.g. J → ) or I → 1)
                if etype == "pan" and len(val) == 10:
                    pan_prefixes[val[:9]] = val

        if not values_to_type and not pan_prefixes:
            return []

        # Track which (bbox_key/timestamp_key, type) already exists
        covered: set = set()
        for ent in entities:
            if ent.location_reference.bbox:
                covered.add((tuple(ent.location_reference.bbox), ent.type.lower()))
            if ent.location_reference.start_sec is not None:
                covered.add((ent.location_reference.start_sec, ent.type.lower()))

        new_entities: list[DetectedEntity] = []

        if bounding_boxes:
            for bb in bounding_boxes:
                bb_text = bb.get("text", "")
                bb_bbox = bb.get("bbox")
                if not bb_bbox or not bb_text:
                    continue

                bb_key = tuple(bb_bbox)

                # Exact value match
                for value, etype in values_to_type.items():
                    if (bb_key, etype) in covered:
                        continue
                    if value in bb_text:
                        new_entities.append(DetectedEntity(
                            entity_id=uuid4().hex,
                            type=etype,
                            raw_value=value,
                            location_reference=LocationReference(
                                page=bb.get("page", 1), bbox=list(bb_bbox),
                            ),
                            confidence_score=0.80,
                        ))
                        covered.add((bb_key, etype))

                # PAN prefix match (OCR error tolerance for last character)
                if (bb_key, "pan") not in covered:
                    for prefix, full_pan in pan_prefixes.items():
                        if prefix in bb_text:
                            new_entities.append(DetectedEntity(
                                entity_id=uuid4().hex,
                                type="pan",
                                raw_value=full_pan,
                                location_reference=LocationReference(
                                    page=bb.get("page", 1), bbox=list(bb_bbox),
                                ),
                                confidence_score=0.75,
                            ))
                            covered.add((bb_key, "pan"))
                            break

        if timestamps:
            for ts in timestamps:
                ts_text = ts.get("text", "")
                ts_start = ts.get("start_sec")
                if ts_start is None or not ts_text:
                    continue

                for value, etype in values_to_type.items():
                    if (ts_start, etype) in covered:
                        continue
                    if value.lower() in ts_text.lower():
                        new_entities.append(DetectedEntity(
                            entity_id=uuid4().hex,
                            type=etype,
                            raw_value=value,
                            location_reference=LocationReference(
                                page=1, start_sec=ts_start, end_sec=ts.get("end_sec")
                            ),
                            confidence_score=0.80,
                        ))
                        covered.add((ts_start, etype))

        return new_entities
