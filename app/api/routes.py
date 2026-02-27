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
    RedactResponse,
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


@router.post("/redact", response_model=RedactResponse)
async def redact(
    body: RedactRequest,
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> RedactResponse:
    scan = pipeline.scan_store.get(body.scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan result not found or expired.")

    output_path, report, r2_key = pipeline.redact_from_scan(
        scan,
        approved_ids=body.approved_region_ids,
        manual_regions=body.manual_regions,
    )

    if output_path is None or not output_path.exists():
        raise HTTPException(status_code=422, detail=report.get("status", "redaction_failed"))

    # Generate presigned download URL if R2 upload succeeded
    download_url: str | None = None
    if r2_key:
        download_url = pipeline.object_store.presigned_url(r2_key, expires_in=3600)

    return RedactResponse(
        status="success",
        object_key=r2_key,
        download_url=download_url,
        filename=output_path.name,
        local_path=str(output_path) if not r2_key else None,
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


# ────────────────────────────────────────────────────────────────────
# File retrieval / storage endpoints
# ────────────────────────────────────────────────────────────────────


@router.get("/files/{object_key:path}")
async def get_file_url(
    object_key: str,
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
):
    """Generate a fresh presigned download URL for an R2 object."""
    if not pipeline.object_store.enabled:
        raise HTTPException(status_code=501, detail="Object storage is not configured.")

    url = pipeline.object_store.presigned_url(object_key, expires_in=3600)
    if url is None:
        raise HTTPException(status_code=404, detail="Could not generate URL for the given key.")

    return {"object_key": object_key, "download_url": url, "expires_in": 3600}


@router.get("/files")
async def list_files(
    prefix: str = "redacted/",
    max_keys: int = 100,
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
):
    """List stored files in R2."""
    if not pipeline.object_store.enabled:
        raise HTTPException(status_code=501, detail="Object storage is not configured.")

    objects = pipeline.object_store.list_objects(prefix=prefix, max_keys=max_keys)
    return {"objects": objects, "count": len(objects)}


@router.delete("/files/{object_key:path}")
async def delete_file(
    object_key: str,
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
):
    """Delete a file from R2."""
    if not pipeline.object_store.enabled:
        raise HTTPException(status_code=501, detail="Object storage is not configured.")

    success = pipeline.object_store.delete(object_key)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete object.")

    return {"status": "deleted", "object_key": object_key}
