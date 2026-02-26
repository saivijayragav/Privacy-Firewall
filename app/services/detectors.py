from __future__ import annotations

import re
from uuid import uuid4

from presidio_analyzer import AnalyzerEngine

from app.domain.models import DetectedEntity, LocationReference


CUSTOM_PATTERNS = {
    "AADHAAR": re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b"),
    "UPI_ID": re.compile(r"\b[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}\b"),
    "IFSC": re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"),
    "SWIFT": re.compile(r"\b[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?\b"),
}


class EntityDetector:
    def __init__(self) -> None:
        self.analyzer = AnalyzerEngine()

    def detect(self, text_segments: list[dict], bounding_boxes: list[dict], timestamps: list[dict]) -> list[DetectedEntity]:
        entities: list[DetectedEntity] = []
        joined_text = "\n".join(seg.get("text", "") for seg in text_segments)

        try:
            results = self.analyzer.analyze(text=joined_text, language="en")
            for result in results:
                raw = joined_text[result.start : result.end]
                entities.append(
                    DetectedEntity(
                        entity_id=uuid4().hex,
                        type=result.entity_type.lower(),
                        raw_value=raw,
                        location_reference=LocationReference(start_char=result.start, end_char=result.end),
                        confidence_score=float(result.score),
                    )
                )
        except Exception:
            pass

        for entity_name, pattern in CUSTOM_PATTERNS.items():
            for match in pattern.finditer(joined_text):
                entities.append(
                    DetectedEntity(
                        entity_id=uuid4().hex,
                        type=entity_name.lower(),
                        raw_value=match.group(0),
                        location_reference=LocationReference(start_char=match.start(), end_char=match.end()),
                        confidence_score=0.85,
                    )
                )

        indexed_bbox = {item.get("text"): item.get("bbox") for item in bounding_boxes if item.get("text")}
        for item in entities:
            if item.raw_value in indexed_bbox:
                item.location_reference.bbox = indexed_bbox[item.raw_value]

        if timestamps:
            for item in entities:
                for segment in timestamps:
                    if item.raw_value and item.raw_value in segment.get("text", ""):
                        item.location_reference.start_sec = segment.get("start_sec")
                        item.location_reference.end_sec = segment.get("end_sec")
                        break

        return entities
