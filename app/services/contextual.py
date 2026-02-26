from __future__ import annotations

import json

import httpx

from app.domain.models import ContextualEvaluation, DetectedEntity, SeverityLevel
from app.settings import AppSettings


class ContextualIntelligenceService:
    def __init__(self, settings: AppSettings) -> None:
        self.settings = settings

    async def classify(self, entities: list[DetectedEntity], full_text: str) -> list[ContextualEvaluation]:
        results: list[ContextualEvaluation] = []
        for entity in entities:
            evaluation = await self._classify_entity(entity, full_text)
            results.append(evaluation)
        return results

    async def _classify_entity(self, entity: DetectedEntity, full_text: str) -> ContextualEvaluation:
        if not self.settings.aipipe_token:
            return self._heuristic_fallback(entity)

        prompt = self._build_prompt(entity, full_text)
        url = f"{self.settings.aipipe_base_url}/openai/v1/responses"
        headers = {
            "Authorization": f"Bearer {self.settings.aipipe_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.settings.aipipe_model,
            "input": prompt,
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()

            text_out = self._extract_output_text(data)
            parsed = json.loads(text_out)
            severity = SeverityLevel(parsed.get("severity_level", "low").lower())
            return ContextualEvaluation(
                entity_id=entity.entity_id,
                is_sensitive=bool(parsed.get("is_sensitive", True)),
                severity_level=severity,
                confidence_score=float(parsed.get("confidence_score", entity.confidence_score)),
                reasoning=str(parsed.get("reasoning", "LLM contextual decision.")),
            )
        except Exception:
            return self._heuristic_fallback(entity)

    def _extract_output_text(self, payload: dict) -> str:
        output = payload.get("output", [])
        if not output:
            return "{}"
        content = output[0].get("content", [])
        if not content:
            return "{}"
        text = content[0].get("text")
        return text if isinstance(text, str) else "{}"

    def _build_prompt(self, entity: DetectedEntity, full_text: str) -> str:
        context_window = full_text[:2500]
        return (
            "You are a privacy classifier. Return strict JSON with keys: "
            "is_sensitive (boolean), severity_level (high|medium|low), confidence_score (0..1), reasoning (string). "
            "No markdown, no extra prose.\n"
            f"Entity type: {entity.type}\n"
            f"Entity value: {entity.raw_value}\n"
            f"Document context:\n{context_window}"
        )

    def _heuristic_fallback(self, entity: DetectedEntity) -> ContextualEvaluation:
        high_tokens = {"credit_card", "aadhaar", "ssn", "iban", "bank_account"}
        medium_tokens = {"phone", "email", "address", "upi_id", "ifsc", "swift"}

        entity_type = entity.type.lower()
        if entity_type in high_tokens:
            severity = SeverityLevel.HIGH
            sensitive = True
            score = max(entity.confidence_score, 0.85)
        elif entity_type in medium_tokens:
            severity = SeverityLevel.MEDIUM
            sensitive = True
            score = max(entity.confidence_score, 0.7)
        else:
            severity = SeverityLevel.LOW
            sensitive = True
            score = max(entity.confidence_score, 0.55)

        return ContextualEvaluation(
            entity_id=entity.entity_id,
            is_sensitive=sensitive,
            severity_level=severity,
            confidence_score=min(score, 1.0),
            reasoning="Heuristic fallback classification.",
        )
