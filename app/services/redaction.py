from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from app.domain.models import (
    DetectedEntity,
    MediaType,
    RedactionPlan,
    RedactionRegion,
)


class RedactionService:
    def plan(self, media_type: MediaType, entities: list[DetectedEntity]) -> RedactionPlan:
        regions: list[RedactionRegion] = []
        audio_timestamps: list[tuple[float, float]] = []
        for entity in entities:
            if media_type == MediaType.AUDIO and entity.location_reference.start_sec is not None:
                audio_timestamps.append(
                    (
                        float(entity.location_reference.start_sec),
                        float(entity.location_reference.end_sec or entity.location_reference.start_sec),
                    )
                )
            regions.append(
                RedactionRegion(
                    entity_id=entity.entity_id,
                    media_type=media_type,
                    location_reference=entity.location_reference,
                    strategy_type="blackout" if media_type in {MediaType.DOCUMENT, MediaType.IMAGE} else "bleep",
                )
            )

        return RedactionPlan(
            redaction_regions=regions,
            audio_timestamps=audio_timestamps,
            strategy_type="hybrid",
            reversible_reference_id=uuid4().hex,
        )

    def execute(self, media_type: MediaType, source_file: Path, output_dir: Path, plan: RedactionPlan) -> tuple[Path | None, dict]:
        output_dir.mkdir(parents=True, exist_ok=True)
        output_file = output_dir / f"redacted_{source_file.name}"

        if media_type == MediaType.DOCUMENT:
            report = self._redact_document(source_file, output_file, plan)
            return output_file if output_file.exists() else None, report

        if media_type == MediaType.IMAGE:
            report = self._redact_image(source_file, output_file, plan)
            return output_file if output_file.exists() else None, report

        if media_type == MediaType.AUDIO:
            report = self._redact_audio(source_file, output_file, plan)
            return output_file if output_file.exists() else None, report

        return None, {"status": "unsupported_media_type"}

    def _redact_document(self, source: Path, output: Path, plan: RedactionPlan) -> dict:
        try:
            import fitz

            doc = fitz.open(source)
            for item in plan.redaction_regions:
                page_num = (item.location_reference.page or 1) - 1
                bbox = item.location_reference.bbox
                if bbox and 0 <= page_num < len(doc):
                    rect = fitz.Rect(*bbox)
                    doc[page_num].add_redact_annot(rect, fill=(0, 0, 0))
            for page in doc:
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
            doc.save(output)
            return {"status": "success", "regions_redacted": len(plan.redaction_regions)}
        except Exception as exc:
            return {"status": "failed", "reason": str(exc)}

    def _redact_image(self, source: Path, output: Path, plan: RedactionPlan) -> dict:
        try:
            import cv2

            image = cv2.imread(str(source))
            if image is None:
                return {"status": "failed", "reason": "unable to load image"}

            redacted = 0
            for item in plan.redaction_regions:
                bbox = item.location_reference.bbox
                if not bbox:
                    continue
                x0, y0, x1, y1 = [int(v) for v in bbox]
                cv2.rectangle(image, (x0, y0), (x1, y1), (0, 0, 0), thickness=-1)
                redacted += 1
            cv2.imwrite(str(output), image)
            return {"status": "success", "regions_redacted": redacted}
        except Exception as exc:
            return {"status": "failed", "reason": str(exc)}

    def _redact_audio(self, source: Path, output: Path, plan: RedactionPlan) -> dict:
        try:
            from pydub import AudioSegment
            from pydub.generators import Sine

            audio = AudioSegment.from_file(source)
            redacted = 0
            for start_sec, end_sec in plan.audio_timestamps:
                start_ms = int(start_sec * 1000)
                end_ms = int(end_sec * 1000)
                if end_ms <= start_ms:
                    continue
                duration = end_ms - start_ms
                bleep = Sine(1000).to_audio_segment(duration=duration).apply_gain(-6)
                audio = audio[:start_ms] + bleep + audio[end_ms:]
                redacted += 1
            audio.export(output, format=source.suffix.replace(".", "") or "wav")
            return {"status": "success", "segments_redacted": redacted}
        except Exception as exc:
            return {"status": "failed", "reason": str(exc)}
