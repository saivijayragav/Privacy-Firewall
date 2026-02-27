from __future__ import annotations

import re
from uuid import uuid4

from presidio_analyzer import AnalyzerEngine

from app.domain.models import DetectedEntity, LocationReference


# UPI_ID: restrict domain to known UPI handle suffixes so we don't match emails
_UPI_HANDLES = r"(?:upi|paytm|oksbi|okhdfcbank|okicici|okaxis|ybl|ibl|apl|axisb|sbi|icici|hdfc|kotak)"
CUSTOM_PATTERNS = {
    "AADHAAR": re.compile(r"\b\d{4}[\s.-]?\d{4}[\s.-]?\d{4}\b"),
    "AADHAAR_VID": re.compile(r"\b\d{4}[\s.-]?\d{4}[\s.-]?\d{4}[\s.-]?\d{4}\b"),
    "PAN": re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"),
    "AADHAAR_ENROLMENT": re.compile(r"\b\d{4}/\d{5}/\d{5}\b"),
    "PASSPORT": re.compile(r"\b[A-Z]\d{7}\b"),
    "DRIVING_LICENSE": re.compile(r"\b[A-Z]{2}\d{2}\s?\d{11}\b"),
    "VOTER_ID": re.compile(r"\b[A-Z]{3}\d{7}\b"),
    "VEHICLE_REG": re.compile(r"\b[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}\b"),
    "UPI_ID": re.compile(rf"\b[a-zA-Z0-9.\-_]{{2,}}@{_UPI_HANDLES}\b", re.IGNORECASE),
    "IFSC": re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"),
    "SWIFT": re.compile(r"\b[A-Z]{4}[A-Z]{2}[A-Z0-9]*\d[A-Z0-9]*\b"),
    "DATE_OF_BIRTH": re.compile(
        r"(?:DOB|D\.?O\.?B\.?|Date\s*of\s*Birth)\s*[:.\-]?\s*(\d{2}[/\-.]\d{2}[/\-.]\d{4})",
        re.IGNORECASE,
    ),
    "PARENT_NAME": re.compile(
        r"(?:S/O|D/O|W/O|C/O|Father|Mother|Husband)\s*[:.\-]?\s*([A-Za-z][A-Za-z .]{2,40})",
        re.IGNORECASE,
    ),
    "PIN_CODE": re.compile(r"\b[1-9]\d{5}\b"),
    "GENDER": re.compile(r"\b(?:MALE|FEMALE|TRANSGENDER)\b", re.IGNORECASE),
}


# Minimum Presidio confidence to accept a detection (filters noisy US-centric
# false positives like us_driver_license at 0.01 on Indian documents).
MIN_PRESIDIO_CONFIDENCE = 0.15


def _build_segment_offset_map(
    text_segments: list[dict],
    bounding_boxes: list[dict],
    page: int,
) -> tuple[str, list[tuple[int, int, int]]]:
    """Build *page_text* and a parallel offset map.

    Returns
    -------
    page_text : str
        Segments for *page* joined with ``\\n``.
    offset_map : list[tuple[start_offset, end_offset, seg_global_index]]
        One entry per segment telling which character range in *page_text*
        corresponds to which index into the **original** *text_segments* /
        *bounding_boxes* lists (they are 1-to-1 by construction in
        ``SignalExtractor``).
    """
    # Build a lookup from (page, text) -> list of global indices so we can
    # find the right bounding_boxes entry even when there are duplicate texts.
    seg_indices: list[int] = []
    for global_idx, seg in enumerate(text_segments):
        if seg.get("page", 1) == page:
            seg_indices.append(global_idx)

    offset_map: list[tuple[int, int, int]] = []
    parts: list[str] = []
    offset = 0
    for local_idx, global_idx in enumerate(seg_indices):
        text = text_segments[global_idx].get("text", "")
        parts.append(text)
        end = offset + len(text)
        offset_map.append((offset, end, global_idx))
        offset = end + 1  # +1 for the "\n" separator

    page_text = "\n".join(parts)
    return page_text, offset_map


def map_bbox_by_offset(
    entity: DetectedEntity,
    offset_map: list[tuple[int, int, int]],
    bounding_boxes: list[dict],
) -> None:
    """Set ``entity.location_reference.bbox`` using the character-offset map.

    Falls back to a substring scan when the offset map cannot resolve the
    entity (e.g. entity produced outside the normal detection flow).
    """
    start = entity.location_reference.start_char
    if start is not None:
        for seg_start, seg_end, global_idx in offset_map:
            if seg_start <= start < seg_end:
                bb = bounding_boxes[global_idx] if global_idx < len(bounding_boxes) else None
                if bb and bb.get("bbox"):
                    entity.location_reference.bbox = bb["bbox"]
                return  # resolved (even if bbox was None for that segment)

    # Fallback: substring match (for entities without valid start_char)
    ent_page = entity.location_reference.page
    for bb in bounding_boxes:
        if bb.get("page") == ent_page and entity.raw_value in bb.get("text", "") and bb.get("bbox"):
            entity.location_reference.bbox = bb["bbox"]
            return


class EntityDetector:
    def __init__(self) -> None:
        self.analyzer = AnalyzerEngine()

    def detect(
        self,
        text_segments: list[dict],
        bounding_boxes: list[dict],
        timestamps: list[dict],
    ) -> list[DetectedEntity]:
        entities: list[DetectedEntity] = []

        # ---- Per-page detection to preserve page numbers ----
        pages: set[int] = {seg.get("page", 1) for seg in text_segments}

        # Collect per-page offset maps so we can reuse them for bbox mapping
        page_offset_maps: dict[int, list[tuple[int, int, int]]] = {}

        for page_num in sorted(pages):
            page_text, offset_map = _build_segment_offset_map(
                text_segments, bounding_boxes, page_num,
            )
            page_offset_maps[page_num] = offset_map
            if not page_text.strip():
                continue

            # Presidio detection (with confidence threshold)
            try:
                results = self.analyzer.analyze(text=page_text, language="en")
                for result in results:
                    if float(result.score) < MIN_PRESIDIO_CONFIDENCE:
                        continue
                    raw = page_text[result.start : result.end]
                    entities.append(
                        DetectedEntity(
                            entity_id=uuid4().hex,
                            type=result.entity_type.lower(),
                            raw_value=raw,
                            location_reference=LocationReference(
                                page=page_num,
                                start_char=result.start,
                                end_char=result.end,
                            ),
                            confidence_score=float(result.score),
                        )
                    )
            except Exception:
                pass

            # Custom pattern detection
            for entity_name, pattern in CUSTOM_PATTERNS.items():
                for match in pattern.finditer(page_text):
                    entities.append(
                        DetectedEntity(
                            entity_id=uuid4().hex,
                            type=entity_name.lower(),
                            raw_value=match.group(0),
                            location_reference=LocationReference(
                                page=page_num,
                                start_char=match.start(),
                                end_char=match.end(),
                            ),
                            confidence_score=0.85,
                        )
                    )

        # ---- Deduplicate: same type + value at the same character position ----
        # Use start_char so the same value at different locations is preserved
        # (e.g. Aadhaar number appearing on both front and back of a card).
        seen: set[tuple[int | None, str, str, int | None]] = set()
        unique: list[DetectedEntity] = []
        for ent in entities:
            key = (ent.location_reference.page, ent.type.lower(), ent.raw_value, ent.location_reference.start_char)
            if key not in seen:
                seen.add(key)
                unique.append(ent)
        entities = unique

        # ---- Map bounding boxes using offset map (position-aware) ----
        for ent in entities:
            page_num = ent.location_reference.page or 1
            omap = page_offset_maps.get(page_num, [])
            map_bbox_by_offset(ent, omap, bounding_boxes)

        # ---- Map audio timestamps ----
        if timestamps:
            for ent in entities:
                for segment in timestamps:
                    if ent.raw_value and ent.raw_value in segment.get("text", ""):
                        ent.location_reference.start_sec = segment.get("start_sec")
                        ent.location_reference.end_sec = segment.get("end_sec")
                        break

        return entities
