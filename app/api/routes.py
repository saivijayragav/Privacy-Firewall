from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.dependencies import get_pipeline
from app.domain.contracts import ProcessOptions
from app.domain.models import ProcessingMode, ProcessingResponse
from app.services.pipeline import PrivacyFirewallPipeline

router = APIRouter()


def _build_options(mode: str, apply_redaction: bool, score_threshold: float | None, policy_json: str | None) -> ProcessOptions:
    policy = None
    if policy_json:
        import json

        policy = json.loads(policy_json)

    return ProcessOptions(
        mode=ProcessingMode(mode),
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
    mode: str = Form("warn"),
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
    mode: str = Form("warn"),
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
    mode: str = Form("warn"),
    apply_redaction: bool = Form(False),
    score_threshold: float | None = Form(default=None),
    policy_json: str | None = Form(default=None),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ProcessingResponse:
    options = _build_options(mode, apply_redaction, score_threshold, policy_json)
    path = await _persist_upload(pipeline, file)
    return await pipeline.process_audio(path, options)
