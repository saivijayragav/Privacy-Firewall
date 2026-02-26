from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4


@dataclass
class ExtractionOutput:
    request_id: str
    text_segments: list[dict]
    bounding_boxes: list[dict]
    faces: list[dict]
    objects: list[dict]
    timestamps: list[dict]
    temp_file_path: Path
    media_type: str


class SignalExtractor:
    def __init__(self, temp_dir: Path) -> None:
        self.temp_dir = temp_dir
        self.temp_dir.mkdir(parents=True, exist_ok=True)

    def persist_upload(self, filename: str, content: bytes) -> Path:
        request_id = uuid4().hex
        safe_name = f"{request_id}_{filename}"
        path = self.temp_dir / safe_name
        path.write_bytes(content)
        return path

    def extract_document(self, file_path: Path) -> ExtractionOutput:
        text_segments: list[dict] = []
        bounding_boxes: list[dict] = []
        try:
            import fitz

            doc = fitz.open(file_path)
            for page_idx, page in enumerate(doc):
                for block in page.get_text("blocks"):
                    x0, y0, x1, y1, text, *_ = block
                    cleaned = (text or "").strip()
                    if not cleaned:
                        continue
                    text_segments.append({"page": page_idx + 1, "text": cleaned})
                    bounding_boxes.append(
                        {
                            "page": page_idx + 1,
                            "bbox": [float(x0), float(y0), float(x1), float(y1)],
                            "text": cleaned,
                        }
                    )
        except Exception:
            raw = file_path.read_text(encoding="utf-8", errors="ignore")
            text_segments.append({"page": 1, "text": raw})

        return ExtractionOutput(
            request_id=uuid4().hex,
            text_segments=text_segments,
            bounding_boxes=bounding_boxes,
            faces=[],
            objects=[],
            timestamps=[],
            temp_file_path=file_path,
            media_type="document",
        )

    def extract_image(self, file_path: Path) -> ExtractionOutput:
        text_segments: list[dict] = []
        bounding_boxes: list[dict] = []
        faces: list[dict] = []

        try:
            import cv2

            image = cv2.imread(str(file_path))
            if image is not None:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                classifier = cv2.CascadeClassifier(
                    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
                )
                detected = classifier.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4)
                for x, y, w, h in detected:
                    faces.append({"bbox": [float(x), float(y), float(x + w), float(y + h)]})
        except Exception:
            pass

        try:
            import pytesseract
            from PIL import Image

            image = Image.open(io.BytesIO(file_path.read_bytes()))
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
            for i, raw in enumerate(data.get("text", [])):
                token = (raw or "").strip()
                if not token:
                    continue
                left = float(data["left"][i])
                top = float(data["top"][i])
                width = float(data["width"][i])
                height = float(data["height"][i])
                text_segments.append({"page": 1, "text": token})
                bounding_boxes.append(
                    {
                        "page": 1,
                        "bbox": [left, top, left + width, top + height],
                        "text": token,
                    }
                )
        except Exception:
            pass

        return ExtractionOutput(
            request_id=uuid4().hex,
            text_segments=text_segments,
            bounding_boxes=bounding_boxes,
            faces=faces,
            objects=[],
            timestamps=[],
            temp_file_path=file_path,
            media_type="image",
        )

    def extract_audio(self, file_path: Path) -> ExtractionOutput:
        text_segments: list[dict] = []
        timestamps: list[dict] = []

        try:
            from faster_whisper import WhisperModel

            model = WhisperModel("base", device="cpu", compute_type="int8")
            segments, _ = model.transcribe(str(file_path), word_timestamps=True)
            for seg in segments:
                seg_text = seg.text.strip()
                if not seg_text:
                    continue
                text_segments.append({"page": 1, "text": seg_text})
                timestamps.append({"start_sec": float(seg.start), "end_sec": float(seg.end), "text": seg_text})
        except Exception:
            pass

        return ExtractionOutput(
            request_id=uuid4().hex,
            text_segments=text_segments,
            bounding_boxes=[],
            faces=[],
            objects=[],
            timestamps=timestamps,
            temp_file_path=file_path,
            media_type="audio",
        )
