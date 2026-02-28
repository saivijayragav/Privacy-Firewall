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


def _build_options(mode: ProcessingMode, apply_redaction: bool, score_threshold: float | None, policy_json: str | None, use_llm: bool = True) -> ProcessOptions:
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
        use_llm=use_llm,
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
    use_llm: bool = Form(True),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ProcessingResponse:
    options = _build_options(mode, apply_redaction, score_threshold, policy_json, use_llm)
    path = await _persist_upload(pipeline, file)
    return await pipeline.process_document(path, options)


@router.post("/process/image", response_model=ProcessingResponse)
async def process_image(
    file: UploadFile = File(...),
    mode: ProcessingMode = Form(ProcessingMode.WARN),
    apply_redaction: bool = Form(False),
    score_threshold: float | None = Form(default=None),
    policy_json: str | None = Form(default=None),
    use_llm: bool = Form(True),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ProcessingResponse:
    options = _build_options(mode, apply_redaction, score_threshold, policy_json, use_llm)
    path = await _persist_upload(pipeline, file)
    return await pipeline.process_image(path, options)


@router.post("/process/audio", response_model=ProcessingResponse)
async def process_audio(
    file: UploadFile = File(...),
    mode: ProcessingMode = Form(ProcessingMode.WARN),
    apply_redaction: bool = Form(False),
    score_threshold: float | None = Form(default=None),
    policy_json: str | None = Form(default=None),
    use_llm: bool = Form(True),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ProcessingResponse:
    options = _build_options(mode, apply_redaction, score_threshold, policy_json, use_llm)
    path = await _persist_upload(pipeline, file)
    return await pipeline.process_audio(path, options)


# ────────────────────────────────────────────────────────────────────
# Two-phase API: Scan (detection only, no file mutation)
# ────────────────────────────────────────────────────────────────────


@router.post("/scan/document", response_model=ScanResponse)
async def scan_document(
    file: UploadFile = File(...),
    use_llm: bool = Form(True),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ScanResponse:
    path = await _persist_upload(pipeline, file)
    return await pipeline.scan_document(path, use_llm=use_llm)


@router.post("/scan/image", response_model=ScanResponse)
async def scan_image(
    file: UploadFile = File(...),
    use_llm: bool = Form(True),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ScanResponse:
    path = await _persist_upload(pipeline, file)
    return await pipeline.scan_image(path, use_llm=use_llm)


@router.post("/scan/audio", response_model=ScanResponse)
async def scan_audio(
    file: UploadFile = File(...),
    use_llm: bool = Form(True),
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline),
) -> ScanResponse:
    path = await _persist_upload(pipeline, file)
    return await pipeline.scan_audio(path, use_llm=use_llm)


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

import os
from fastapi.responses import FileResponse

@router.get("/download")
async def download_local_file(path: str):
    """Download a locally stored file by its absolute path."""
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found on local storage.")
    
    # Ensure it's a file inside our storage/outputs directory to prevent path traversal
    if "storage" not in path and "outputs" not in path:
        raise HTTPException(status_code=403, detail="Access denied.")
        
    filename = os.path.basename(path)
    return FileResponse(path, filename=filename)


from pydantic import BaseModel
import json

class ScanStatsRequest(BaseModel):
    entity_counts: dict[str, int]
    total_scans: int
    avg_risk_score: float
    high_risk_scans: int

@router.post("/auto-policy")
async def generate_auto_policy(
    stats: ScanStatsRequest,
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline)
):
    """Uses LLM to recommend a custom redaction policy based on scan history."""
    
    import httpx
    
    prompt = f"""
    You are an AI data privacy expert. The user has provided scan statistics of their organizational data. 
    Analyze these statistics and recommend a redaction policy.
    
    Statistics:
    - Total Scans: {stats.total_scans}
    - Average Risk Score: {stats.avg_risk_score}
    - High Risk Scans: {stats.high_risk_scans}
    - Detected Entity Frequencies: {json.dumps(stats.entity_counts)}
    
    Based on this, return a JSON object with:
    1. "always_redact": list of entity types that must always be redacted because they are high risk or appear frequently in high risk scenarios
    2. "ignore": list of entity types that are low risk and can be safely ignored
    3. "recommendations": A list of objects containing "entity_type", "action" (either "redact", "ignore", or "review"), and "reason" (a short sentence explaining why).
    4. "reasoning": A single paragraph explaining your overall strategy.

    Return ONLY valid JSON.
    """
    
    url = f"{pipeline.contextual.settings.aipipe_base_url}/openrouter/v1/responses"
    headers = {
        "Authorization": f"Bearer {pipeline.contextual.settings.aipipe_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": pipeline.contextual.settings.aipipe_model,
        "input": prompt
    }
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            # The AIPipe endpoint returns the response in a specific format we need to extract from
            output = data.get("output", [])
            if not output:
                raise ValueError("No output in LLM response")
            content = output[0].get("content", [])
            if not content:
                raise ValueError("No content array in LLM response")
            result_text = content[0].get("text", "{}")
            
            return json.loads(result_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate AI policy: {str(e)}")

class EntityDetail(BaseModel):
    type: str
    raw_value: str
    severity: str
    reasoning: str

class ReportRequest(BaseModel):
    filename: str
    media_type: str
    risk_score: float
    flagged_entities: list[EntityDetail]

@router.post("/compliance-report")
async def generate_compliance_report(
    req: ReportRequest,
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline)
):
    """Generates a markdown compliance report using the LLM based on scan results."""
    import httpx
    
    # We construct a summary of the entities to send to the LLM
    entity_summary = "\n".join([
        f"- {e.type} (Severity: {e.severity}): {e.reasoning}" 
        for e in req.flagged_entities
    ])
    
    if not entity_summary:
        entity_summary = "No sensitive entities were detected."
    
    prompt = f"""
    You are an AI data privacy auditor and compliance expert. The user has just scanned a file named "{req.filename}" ({req.media_type}).
    The calculated overall risk score for this file is {req.risk_score} (where 0 is safe and 1.0 is highest risk).
    
    Here are the specific sensitive entities that were flagged during the scan:
    {entity_summary}
    
    Based on this information, generate a professional, highly readable Smart Privacy Report in Markdown format.
    The report MUST include:
    1. An Executive Summary explaining the file's overall risk level.
    2. A Risk Assessment breaking down why the flagged entities are dangerous if exposed.
    3. Regulatory Compliance Analysis: Specifically map the found entities to relevant data protection laws (e.g., GDPR, CCPA, India DPDP Act), mentioning how their exposure might violate these regulations.
    4. Actionable Recommendations formatting as a bulleted list telling the user exactly what to redact or how to handle this file safely.
    
    Respond ONLY with the raw Markdown text for the report. Do not use JSON. Make it sound professional and authoritative.
    """
    
    url = f"{pipeline.contextual.settings.aipipe_base_url}/openrouter/v1/responses"
    headers = {
        "Authorization": f"Bearer {pipeline.contextual.settings.aipipe_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": pipeline.contextual.settings.aipipe_model,
        "input": prompt
    }
    
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            output = data.get("output", [])
            if not output:
                raise ValueError("No output in LLM response")
            content = output[0].get("content", [])
            if not content:
                raise ValueError("No content array in LLM response")
            result_text = content[0].get("text", "")
            
            return {"report_markdown": result_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate compliance report: {str(e)}")

class SuggestionRequest(BaseModel):
    filename: str
    media_type: str
    risk_score: float
    flagged_entities: list[EntityDetail]

@router.post("/privacy-suggestions")
async def get_privacy_suggestions(
    req: SuggestionRequest,
    pipeline: PrivacyFirewallPipeline = Depends(get_pipeline)
):
    """Provides actionable, human-like privacy advice based on a file scan result."""
    import httpx
    
    if req.risk_score == 0 or not req.flagged_entities:
        return {"suggestions": ["This file looks completely clean. No action needed!"]}
        
    entity_summary = "\n".join([
        f"- {e.type} (Severity: {e.severity})" 
        for e in req.flagged_entities[:15] # Cap at 15 to avoid token limits
    ])
    
    prompt = f"""
    You are an intelligent Privacy Agent built into a web dashboard for a tool called "PixelGuard".
    The user just scanned a file named "{req.filename}" (Type: {req.media_type}).
    The overall risk score was calculated at {req.risk_score} (0 is safe, 1.0 is extremely dangerous).
    
    Here are the sensitive entities found in the file:
    {entity_summary}
    
    Based on the entities found and the filename, guess what kind of document this is (e.g., a resume, a bank statement, an ID card) and generate exactly 2-3 short, highly-contextual, and ACTIONABLE sentences of advice.
    
    Example output format:
    [
      "This document appears to be a resume. I highly recommend you redact the phone number and physical address before sending it to external recruiters.",
      "Consider using the 'Warn & Recommend' processing mode next time to flag these fields automatically."
    ]
    
    Return ONLY a strict JSON array of strings. Do not use Markdown formatting in the response block itself, just raw JSON.
    """
    
    url = f"{pipeline.contextual.settings.aipipe_base_url}/openrouter/v1/responses"
    headers = {
        "Authorization": f"Bearer {pipeline.contextual.settings.aipipe_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": pipeline.contextual.settings.aipipe_model,
        "input": prompt
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            
            output = data.get("output", [])
            if not output:
                raise ValueError("No output in LLM response")
            content = output[0].get("content", [])
            if not content:
                raise ValueError("No content array in LLM response")
            result_text = content[0].get("text", "[]")
            
            import json
            suggestions = json.loads(result_text)
            
            # Ensure it's a list
            if not isinstance(suggestions, list):
                suggestions = [str(suggestions)]
                
            return {"suggestions": suggestions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate suggestions: {str(e)}")
