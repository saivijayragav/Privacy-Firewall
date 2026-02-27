from __future__ import annotations

import io
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from uuid import uuid4


@lru_cache(maxsize=16)
def _tesseract_lang_available(lang: str) -> bool:
    """Check if a Tesseract language pack is installed."""
    try:
        result = subprocess.run(
            ["tesseract", "--list-langs"],
            capture_output=True, text=True, timeout=5,
        )
        return lang in result.stdout
    except Exception:
        return False


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
                    x0, y0, x1, y1, text, block_no, block_type = block[0], block[1], block[2], block[3], block[4], block[5], block[6]
                    # block_type 0 = text, 1 = image — skip image blocks
                    if block_type != 0:
                        continue
                    cleaned = (str(text) if text else "").strip()
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
            doc.close()
        except Exception:
            # Only attempt text fallback for non-PDF files (plain text, etc.)
            try:
                raw = file_path.read_text(encoding="utf-8")
                text_segments.append({"page": 1, "text": raw})
            except UnicodeDecodeError:
                pass  # Binary file we can't read as text

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
        objects: list[dict] = []
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

        # ---- QR code decoding ----
        try:
            from pyzbar.pyzbar import decode as decode_qr
            from PIL import Image as PILImage, ImageFilter, ImageOps

            qr_image = PILImage.open(io.BytesIO(file_path.read_bytes()))
            # Try decoding at native resolution first
            qr_results = decode_qr(qr_image)
            if not qr_results:
                # Upscale 3x + grayscale + sharpen for compressed/low-res images
                gray = ImageOps.grayscale(qr_image)
                upscaled = gray.resize(
                    (gray.width * 3, gray.height * 3), PILImage.LANCZOS
                )
                upscaled = upscaled.filter(ImageFilter.SHARPEN)
                qr_results = decode_qr(upscaled)
                scale = 1.0 / 3.0  # bboxes need to be scaled back down
            else:
                scale = 1.0
            for qr in qr_results:
                qr_text = qr.data.decode("utf-8", errors="ignore").strip()
                if not qr_text:
                    continue
                x, y, w, h = qr.rect
                x, y, w, h = x * scale, y * scale, w * scale, h * scale
                text_segments.append({"page": 1, "text": qr_text, "source": "qr_code"})
                bounding_boxes.append(
                    {
                        "page": 1,
                        "bbox": [float(x), float(y), float(x + w), float(y + h)],
                        "text": qr_text,
                    }
                )
                objects.append({"type": "qr_code", "bbox": [float(x), float(y), float(x + w), float(y + h)]})
        except Exception:
            pass

        # ---- OpenCV QR detector fallback ----
        try:
            import cv2 as _cv2

            cv_img = _cv2.imread(str(file_path))
            if cv_img is not None:
                qr_detector = _cv2.QRCodeDetector()
                retval, decoded_info, points, _ = qr_detector.detectAndDecodeMulti(cv_img)
                if retval and decoded_info:
                    existing_qr_texts = {s["text"] for s in text_segments if s.get("source") == "qr_code"}
                    for idx_q, qr_text in enumerate(decoded_info):
                        qr_text = (qr_text or "").strip()
                        if not qr_text or qr_text in existing_qr_texts:
                            continue
                        # Get bounding box from points
                        if points is not None and idx_q < len(points):
                            pts = points[idx_q]
                            x0 = float(min(p[0] for p in pts))
                            y0 = float(min(p[1] for p in pts))
                            x1 = float(max(p[0] for p in pts))
                            y1 = float(max(p[1] for p in pts))
                        else:
                            x0, y0, x1, y1 = 0.0, 0.0, 0.0, 0.0
                        text_segments.append({"page": 1, "text": qr_text, "source": "qr_code"})
                        bounding_boxes.append(
                            {
                                "page": 1,
                                "bbox": [x0, y0, x1, y1],
                                "text": qr_text,
                            }
                        )
                        objects.append({"type": "qr_code", "bbox": [x0, y0, x1, y1]})
        except Exception:
            pass

        try:
            import pytesseract
            from PIL import Image

            image = Image.open(io.BytesIO(file_path.read_bytes()))
            # Use eng+tam for mixed English/Tamil documents (e.g. Aadhaar cards)
            ocr_lang = "eng+tam" if _tesseract_lang_available("tam") else "eng"
            data = pytesseract.image_to_data(image, lang=ocr_lang, output_type=pytesseract.Output.DICT)

            # Group tokens by (block_num, par_num, line_num) to reconstruct lines
            lines: dict[tuple[int, int, int], list[tuple[str, float, float, float, float]]] = {}
            for i, raw in enumerate(data.get("text", [])):
                token = (raw or "").strip()
                if not token:
                    continue
                key = (int(data["block_num"][i]), int(data["par_num"][i]), int(data["line_num"][i]))
                left = float(data["left"][i])
                top = float(data["top"][i])
                width = float(data["width"][i])
                height = float(data["height"][i])
                lines.setdefault(key, []).append((token, left, top, width, height))

            for _key, tokens in lines.items():
                line_text = " ".join(t[0] for t in tokens)
                # Merge bounding boxes: min x0/y0, max x1/y1
                x0 = min(t[1] for t in tokens)
                y0 = min(t[2] for t in tokens)
                x1 = max(t[1] + t[3] for t in tokens)
                y1 = max(t[2] + t[4] for t in tokens)
                text_segments.append({"page": 1, "text": line_text})
                bounding_boxes.append(
                    {
                        "page": 1,
                        "bbox": [x0, y0, x1, y1],
                        "text": line_text,
                    }
                )
        except Exception:
            pass

        return ExtractionOutput(
            request_id=uuid4().hex,
            text_segments=text_segments,
            bounding_boxes=bounding_boxes,
            faces=faces,
            objects=objects,
            timestamps=[],
            temp_file_path=file_path,
            media_type="image",
        )

    _whisper_model = None

    @classmethod
    def _get_whisper_model(cls):
        if cls._whisper_model is None:
            from faster_whisper import WhisperModel
            cls._whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
        return cls._whisper_model

    def extract_audio(self, file_path: Path) -> ExtractionOutput:
        text_segments: list[dict] = []
        timestamps: list[dict] = []

        try:
            model = self._get_whisper_model()
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
