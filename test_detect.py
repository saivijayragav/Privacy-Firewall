import asyncio
from app.services.detectors import EntityDetector

detector = EntityDetector()

text_segments = [
    {"page": 1, "text": "Name: John Doe"},
    {"page": 1, "text": "PAN: ABCPD1234E"},
    {"page": 1, "text": "Address: 123 Main St"},
    {"page": 1, "text": "Second PAN: ABCPD1234E"},
]
bounding_boxes = [
    {"page": 1, "text": "Name: John Doe", "bbox": [10, 10, 100, 20]},
    {"page": 1, "text": "PAN: ABCPD1234E", "bbox": [10, 30, 200, 40]},
    {"page": 1, "text": "Address: 123 Main St", "bbox": [10, 50, 150, 60]},
    {"page": 1, "text": "Second PAN: ABCPD1234E", "bbox": [10, 70, 250, 80]},
]

entities = detector.detect(text_segments, bounding_boxes, timestamps=[])
for e in entities:
    if e.type == "pan":
        print(f"Detected: {e.raw_value}, start_char: {e.location_reference.start_char}, bbox: {e.location_reference.bbox}")
