from __future__ import annotations

from pathlib import Path

from app.domain.contracts import ProcessOptions
from app.domain.models import (
    AuditEvent,
    FlaggedEntity,
    MediaType,
    ProcessingResponse,
)
from app.services.contextual import ContextualIntelligenceService
from app.services.decisioning import DecisionEngine, RiskScoringService
from app.services.detectors import EntityDetector
from app.services.extractors import SignalExtractor
from app.services.redaction import RedactionService


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
    ) -> None:
        self.extractor = extractor
        self.detector = detector
        self.contextual = contextual
        self.scorer = scorer
        self.decision_engine = decision_engine
        self.redaction = redaction
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def process_document(self, file_path: Path, options: ProcessOptions) -> ProcessingResponse:
        extraction = self.extractor.extract_document(file_path)
        return await self._process(extraction, MediaType.DOCUMENT, options)

    async def process_image(self, file_path: Path, options: ProcessOptions) -> ProcessingResponse:
        extraction = self.extractor.extract_image(file_path)
        return await self._process(extraction, MediaType.IMAGE, options)

    async def process_audio(self, file_path: Path, options: ProcessOptions) -> ProcessingResponse:
        extraction = self.extractor.extract_audio(file_path)
        return await self._process(extraction, MediaType.AUDIO, options)

    async def _process(self, extraction, media_type: MediaType, options: ProcessOptions) -> ProcessingResponse:
        audit_log: list[AuditEvent] = []
        reasoning_trace: list[str] = []

        full_text = "\n".join(seg.get("text", "") for seg in extraction.text_segments)
        entities = self.detector.detect(extraction.text_segments, extraction.bounding_boxes, extraction.timestamps)
        audit_log.append(AuditEvent(stage="entity_detection", details={"count": len(entities)}))

        contextual = await self.contextual.classify(entities, full_text)
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

        if should_redact and recommended_plan and (options.apply_redaction or options.mode.value in {"auto_redact", "policy"}):
            out, report = self.redaction.execute(media_type, extraction.temp_file_path, self.output_dir, recommended_plan)
            redaction_report = report
            output_file_path = str(out) if out else None
            audit_log.append(AuditEvent(stage="redaction_execution", details=report))

        warning_message = None
        if risk_score >= 0.7:
            warning_message = "High privacy risk detected. Review before sharing."
        elif risk_score >= 0.4:
            warning_message = "Moderate privacy risk detected. Redaction recommended."

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
        )
