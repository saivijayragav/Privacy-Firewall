from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ProcessingMode(str, Enum):
    FLAG = "flag"
    WARN = "warn"
    AUTO_REDACT = "auto_redact"
    POLICY = "policy"


class SeverityLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class MediaType(str, Enum):
    DOCUMENT = "document"
    IMAGE = "image"
    AUDIO = "audio"


class LocationReference(BaseModel):
    page: int | None = None
    bbox: list[float] | None = None
    start_char: int | None = None
    end_char: int | None = None
    start_sec: float | None = None
    end_sec: float | None = None


class DetectedEntity(BaseModel):
    entity_id: str
    type: str
    raw_value: str
    location_reference: LocationReference
    confidence_score: float = Field(ge=0, le=1)


class ContextualEvaluation(BaseModel):
    entity_id: str
    is_sensitive: bool
    severity_level: SeverityLevel
    confidence_score: float = Field(ge=0, le=1)
    reasoning: str


class FlaggedEntity(BaseModel):
    detected: DetectedEntity
    contextual: ContextualEvaluation


class RedactionRegion(BaseModel):
    entity_id: str
    media_type: MediaType
    location_reference: LocationReference
    strategy_type: str


class RedactionPlan(BaseModel):
    redaction_regions: list[RedactionRegion] = Field(default_factory=list)
    audio_timestamps: list[tuple[float, float]] = Field(default_factory=list)
    strategy_type: str = "mask"
    reversible_reference_id: str


class AuditEvent(BaseModel):
    stage: str
    details: dict[str, Any]


class ProcessingResponse(BaseModel):
    mode_used: ProcessingMode
    flagged_entities: list[FlaggedEntity]
    risk_score: float
    warning_message: str | None = None
    recommended_redaction_plan: RedactionPlan | None = None
    redaction_report: dict[str, Any] | None = None
    audit_log: list[AuditEvent]
    reasoning_trace: list[str]
    output_file_path: str | None = None


# ────────────────────────────────────────────────────────────────────
# Two-phase scan → redact models
# ────────────────────────────────────────────────────────────────────


class ScanResponse(BaseModel):
    """Returned by /scan/* endpoints.  No file mutation happens here."""

    scan_id: str
    flagged_entities: list[FlaggedEntity]
    risk_score: float
    warning_message: str | None = None
    recommended_redaction_plan: RedactionPlan | None = None
    audit_log: list[AuditEvent]
    reasoning_trace: list[str]


class ManualRegion(BaseModel):
    """A user-drawn region to include in redaction."""

    bbox: list[float]
    page: int = 1
    label: str | None = None


class RedactRequest(BaseModel):
    """Sent by the client after reviewing the scan result."""

    scan_id: str
    approved_region_ids: list[str] = Field(
        default_factory=list,
        description="Entity IDs from the redaction plan that the user approved.",
    )
    manual_regions: list[ManualRegion] = Field(
        default_factory=list,
        description="Extra regions the user drew on the preview.",
    )


class RegionDetectRequest(BaseModel):
    """Ask the backend to detect entities inside a user-drawn bbox."""

    scan_id: str
    bbox: list[float] = Field(..., min_length=4, max_length=4)
    page: int = 1


class RegionDetectResponse(BaseModel):
    """Entities found inside the user-drawn crop region."""

    entities: list[DetectedEntity]
