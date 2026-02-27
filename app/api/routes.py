from __future__ import annotations

import json
from json import JSONDecodeError

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.dependencies import get_pipeline
from app.domain.contracts import ProcessOptions
from app.domain.models import (
    ProcessingMode,
    ProcessingResponse,
    RedactRequest,
    RegionDetectRequest,
    RegionDetectResponse,
    ScanResponse,
)
from app.services.pipeline import PrivacyFirewallPipeline

router = APIRouter()


def _build_options(mode: ProcessingMode, apply_redaction: bool, score_threshold: float | None, policy_json: str | None) -> ProcessOptions:
    policy = None
    if policy_json and policy_json.strip():
        try:
            parsed = json.loads(policy_json)
            if isinstance(parsed, dict):
                policy = parsed
        except (JSONDecodeError, TypeError):
            pass  # silently ignore non-JSON input like "string"

    return ProcessOptions(
        mode=mode,
        apply_redaction=apply_redaction,
        score_threshold=score_threshold,
        policy=policy,
    )


async def _persist_upload(pipeline: PrivacyFirewallPipeline, upload: UploadFile):
    content = await upload.read()
    return pipeline.extractor.persist_upload(upload.filename or "input.bin", content)


@router.post("/process/document", response_model=ProcessingResponse)
async def process_document(
    file: UploadFile = File(...),
    mode: ProcessingMode = Form(ProcessingMode.WARN),
    apply_redaction: bool = Form(False),
    score_threshold: float | None = Form(default=None),
    policy_json: str | None = Form(default=None),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ProcessingResponse:
    options = _build_options(mode, apply_redaction, score_threshold, policy_json)
    path = await _persist_upload(pipeline, file)
    return await pipeline.process_document(path, options)


@router.post("/process/image", response_model=ProcessingResponse)
async def process_image(
    file: UploadFile = File(...),
    mode: ProcessingMode = Form(ProcessingMode.WARN),
    apply_redaction: bool = Form(False),
    score_threshold: float | None = Form(default=None),
    policy_json: str | None = Form(default=None),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ProcessingResponse:
    options = _build_options(mode, apply_redaction, score_threshold, policy_json)
    path = await _persist_upload(pipeline, file)
    return await pipeline.process_image(path, options)


@router.post("/process/audio", response_model=ProcessingResponse)
async def process_audio(
    file: UploadFile = File(...),
    mode: ProcessingMode = Form(ProcessingMode.WARN),
    apply_redaction: bool = Form(False),
    score_threshold: float | None = Form(default=None),
    policy_json: str | None = Form(default=None),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ProcessingResponse:
    options = _build_options(mode, apply_redaction, score_threshold, policy_json)
    path = await _persist_upload(pipeline, file)
    return await pipeline.process_audio(path, options)


# ────────────────────────────────────────────────────────────────────
# Two-phase API: Scan (detection only, no file mutation)
# ────────────────────────────────────────────────────────────────────


@router.post("/scan/document", response_model=ScanResponse)
async def scan_document(
    file: UploadFile = File(...),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ScanResponse:
    path = await _persist_upload(pipeline, file)
    return await pipeline.scan_document(path)


@router.post("/scan/image", response_model=ScanResponse)
async def scan_image(
    file: UploadFile = File(...),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ScanResponse:
    path = await _persist_upload(pipeline, file)
    return await pipeline.scan_image(path)


@router.post("/scan/audio", response_model=ScanResponse)
async def scan_audio(
    file: UploadFile = File(...),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ScanResponse:
    path = await _persist_upload(pipeline, file)
    return await pipeline.scan_audio(path)


# ────────────────────────────────────────────────────────────────────
# Two-phase API: Redact (apply approved regions from a scan)
# ────────────────────────────────────────────────────────────────────


@router.post("/redact")
async def redact(
    body: RedactRequest,
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> FileResponse:
    scan = pipeline.scan_store.get(body.scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan result not found or expired.")

    output_path, report = pipeline.redact_from_scan(
        scan,
        approved_ids=body.approved_region_ids,
        manual_regions=body.manual_regions,
    )

    if output_path is None or not output_path.exists():
        raise HTTPException(status_code=422, detail=report.get("status", "redaction_failed"))

    # Determine media type for Content-Type header
    suffix = output_path.suffix.lower()
    media_map = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
    }
    media_type = media_map.get(suffix, "application/octet-stream")

    return FileResponse(
        path=str(output_path),
        filename=output_path.name,
        media_type=media_type,
    )


# ────────────────────────────────────────────────────────────────────
# Two-phase API: Detect entities in a user-drawn region
# ────────────────────────────────────────────────────────────────────


@router.post("/detect/region", response_model=RegionDetectResponse)
async def detect_region(
    body: RegionDetectRequest,
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> RegionDetectResponse:
    scan = pipeline.scan_store.get(body.scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan result not found or expired.")

    entities = pipeline.detect_in_region(scan, bbox=body.bbox, page=body.page)
    return RegionDetectResponse(entities=entities)
