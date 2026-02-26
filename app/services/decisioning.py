from __future__ import annotations

from app.domain.models import ContextualEvaluation, ProcessingMode


SEVERITY_WEIGHT = {
    "high": 1.0,
    "medium": 0.6,
    "low": 0.25,
}


class RiskScoringService:
    def compute_score(self, evaluations: list[ContextualEvaluation]) -> float:
        if not evaluations:
            return 0.0
        weighted = [SEVERITY_WEIGHT[item.severity_level.value] * item.confidence_score for item in evaluations if item.is_sensitive]
        if not weighted:
            return 0.0
        raw = sum(weighted) / max(len(weighted), 1)
        return round(min(raw, 1.0), 4)


class DecisionEngine:
    def __init__(self, default_threshold: float) -> None:
        self.default_threshold = default_threshold

    def should_redact(
        self,
        mode: ProcessingMode,
        risk_score: float,
        threshold: float | None,
        policy: dict[str, list[str]] | None,
        flagged_types: list[str],
    ) -> bool:
        if mode == ProcessingMode.FLAG:
            return False

        if mode == ProcessingMode.WARN:
            return False

        if mode == ProcessingMode.AUTO_REDACT:
            effective_threshold = threshold if threshold is not None else self.default_threshold
            return risk_score >= effective_threshold

        if mode == ProcessingMode.POLICY:
            if not policy:
                return False
            always = set(item.lower() for item in policy.get("always_redact", []))
            ignore = set(item.lower() for item in policy.get("ignore", []))
            applicable = [item for item in flagged_types if item not in ignore]
            return any(item in always for item in applicable)

        return False
