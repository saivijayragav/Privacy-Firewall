import re

with open("app/services/pipeline.py", "r") as f:
    text = f.read()

old_block = """    # Track which (bbox_key, type) already exists
    covered: set[tuple[tuple, str]] = set()
    for ent in entities:
        if ent.location_reference.bbox:
            covered.add((tuple(ent.location_reference.bbox), ent.type.lower()))

    new_entities: list[DetectedEntity] = []

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
                    break"""

new_block = """    # Track which (bb_key, type, value) already exists
    # Key must include the page to prevent false-positives across different pages
    covered: set[tuple[tuple, str, str]] = set()
    for ent in entities:
        if ent.location_reference.bbox:
            page = ent.location_reference.page or 1
            key = ((page, tuple(ent.location_reference.bbox)), ent.type.lower(), ent.raw_value.strip())
            covered.add(key)

    new_entities: list[DetectedEntity] = []

    for bb in bounding_boxes:
        bb_text = bb.get("text", "")
        bb_bbox = bb.get("bbox")
        if not bb_bbox or not bb_text:
            continue

        bb_key = (bb.get("page", 1), tuple(bb_bbox))

        # Exact value match
        for value, etype in values_to_type.items():
            if (bb_key, etype, value) in covered:
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
                covered.add((bb_key, etype, value))

        # PAN prefix match (OCR error tolerance for last character)
        for prefix, full_pan in pan_prefixes.items():
            if (bb_key, "pan", full_pan) in covered:
                continue
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
                covered.add((bb_key, "pan", full_pan))"""

text = text.replace(old_block, new_block)
with open("app/services/pipeline.py", "w") as f:
    f.write(text)
print("Done")
