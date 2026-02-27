from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.services.contextual import ContextualIntelligenceService
from app.services.decisioning import DecisionEngine, RiskScoringService
from app.services.detectors import EntityDetector
from app.services.extractors import SignalExtractor
from app.services.object_store import R2ObjectStore
from app.services.pipeline import PrivacyFirewallPipeline
from app.services.redaction import RedactionService
from app.services.scan_store import ScanStore
from app.settings import get_settings


@lru_cache
def get_pipeline() -> PrivacyFirewallPipeline:
    settings = get_settings()
    workspace_root = Path.cwd()
    temp_dir = workspace_root / "storage" / "uploads"
    output_dir = workspace_root / "storage" / "outputs"

    extractor = SignalExtractor(temp_dir=temp_dir)
    detector = EntityDetector()
    contextual = ContextualIntelligenceService(settings=settings)
    scorer = RiskScoringService()
    decision = DecisionEngine(default_threshold=settings.auto_redact_threshold)
    redaction = RedactionService()
    scan_store = ScanStore(ttl_seconds=1800)  # 30-minute TTL
    object_store = R2ObjectStore(
        endpoint_url=settings.r2_endpoint_url,
        access_key_id=settings.cloudflare_access_id,
        secret_access_key=settings.cloudflare_secret_access_key,
        bucket_name=settings.cloudflare_bucket,
    )

    return PrivacyFirewallPipeline(
        extractor=extractor,
        detector=detector,
        contextual=contextual,
        scorer=scorer,
        decision_engine=decision,
        redaction=redaction,
        output_dir=output_dir,
        scan_store=scan_store,
        object_store=object_store,
    )
