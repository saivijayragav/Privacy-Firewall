from pydantic import BaseModel, Field

from app.domain.models import ProcessingMode


class ProcessOptions(BaseModel):
    mode: ProcessingMode = ProcessingMode.WARN
    policy: dict[str, list[str]] | None = None
    apply_redaction: bool = False
    score_threshold: float | None = Field(default=None, ge=0, le=1)
    use_llm: bool = True
