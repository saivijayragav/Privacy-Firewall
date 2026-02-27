"""In-memory scan result store with TTL-based expiration.

Stores scan results between the scan phase and the redact phase so
the client can review / modify regions before applying redaction.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.domain.models import (
    AuditEvent,
    FlaggedEntity,
    MediaType,
    RedactionPlan,
)
from app.services.extractors import ExtractionOutput


@dataclass
class ScanResult:
    scan_id: str
    media_type: MediaType
    extraction: ExtractionOutput
    flagged_entities: list[FlaggedEntity]
    risk_score: float
    warning_message: str | None
    recommended_plan: RedactionPlan | None
    audit_log: list[AuditEvent]
    reasoning_trace: list[str]
    created_at: float = field(default_factory=time.time)


class ScanStore:
    """Thread-safe in-memory store with lazy TTL eviction."""

    def __init__(self, ttl_seconds: int = 1800) -> None:
        self._store: dict[str, ScanResult] = {}
        self._lock = threading.Lock()
        self.ttl = ttl_seconds

    # ------------------------------------------------------------------
    def put(self, result: ScanResult) -> None:
        with self._lock:
            self._evict_expired()
            self._store[result.scan_id] = result

    def get(self, scan_id: str) -> ScanResult | None:
        with self._lock:
            self._evict_expired()
            return self._store.get(scan_id)

    def delete(self, scan_id: str) -> None:
        with self._lock:
            self._store.pop(scan_id, None)

    # ------------------------------------------------------------------
    def _evict_expired(self) -> None:
        now = time.time()
        expired = [k for k, v in self._store.items() if now - v.created_at > self.ttl]
        for k in expired:
            del self._store[k]
