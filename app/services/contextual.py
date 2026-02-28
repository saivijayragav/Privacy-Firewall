from __future__ import annotations

import json

import httpx

from app.domain.models import ContextualEvaluation, DetectedEntity, SeverityLevel
from app.settings import AppSettings


class ContextualIntelligenceService:
    def __init__(self, settings: AppSettings) -> None:
        self.settings = settings
        self._client: httpx.AsyncClient | None = None
        self._api_available: bool | None = None  # cached reachability

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=8.0)
        return self._client

    async def _is_api_reachable(self) -> bool:
        """Quick check; cached after first call."""
        if self._api_available is not None:
            return self._api_available
        if not self.settings.aipipe_token:
            self._api_available = False
            return False
        try:
            client = await self._get_client()
            resp = await client.get(self.settings.aipipe_base_url, timeout=3.0)
            self._api_available = resp.status_code < 500
        except Exception:
            self._api_available = False
        return self._api_available

    async def classify(self, entities: list[DetectedEntity], full_text: str, *, use_llm: bool = True) -> list[ContextualEvaluation]:
        if not entities:
            return []

        # Try batched LLM classification first (only when LLM mode is enabled)
        if use_llm and await self._is_api_reachable():
            result = await self._classify_batch(entities, full_text)
            if result is not None:
                return result

        # Fallback: heuristic for all
        return [self._heuristic_fallback(e) for e in entities]

    async def _classify_batch(self, entities: list[DetectedEntity], full_text: str) -> list[ContextualEvaluation] | None:
        """Classify all entities in a single LLM call."""
        entity_list_str = "\n".join(
            f"  {i+1}. id={e.entity_id} type={e.type} value={e.raw_value}"
            for i, e in enumerate(entities[:50])  # cap at 50
        )
        prompt = (
            "You are an Expert Data Privacy and Security Auditor for an organizational firewall.\n"
            "Your module's job is to evaluate if extracted data points are genuinely sensitive personally identifiable information (PII), secret credentials, or protected financial data, or if they are safe/false-positives based entirely on their surrounding document context.\n"
            "Evaluate EACH entity through the lens of external global privacy frameworks (GDPR, HIPAA, CCPA, PCI-DSS, India DPDP Act) and consider how a malicious external actor (e.g., hacker, phisher) might exploit this specific data point combined with its context.\n"
            "Severity Guidelines:\n"
            "- High: Direct identifiers (SSN, Passport, Credit Cards, API Keys, Passwords, Health Records). High exploitation value.\n"
            "- Medium: Indirect identifiers (Emails, Phone numbers, Physical Addresses, Names) that can single out an individual or aid in spear-phishing.\n"
            "- Low: Public data, generic business addresses, internal non-sensitive codes, or false positives.\n\n"
            "Return strict JSON: a list of objects with keys: "
            "entity_id (string), is_sensitive (boolean), severity_level (high|medium|low), "
            "confidence_score (0..1), reasoning (string).\n"
            "Your reasoning should briefly explain WHY the context makes this sensitive or safe, citing potential regulatory or security implications.\n"
            "No markdown, no extra prose. Return one object per entity in the same order.\n\n"
            f"Entities:\n{entity_list_str}\n\n"
            f"Document context (first 6000 chars):\n{full_text[:6000]}"
        )

        url = f"{self.settings.aipipe_base_url}/openrouter/v1/responses"
        headers = {
            "Authorization": f"Bearer {self.settings.aipipe_token}",
            "Content-Type": "application/json",
        }
        payload = {"model": self.settings.aipipe_model, "input": prompt}

        try:
            client = await self._get_client()
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            text_out = self._extract_output_text(data)
            items = json.loads(text_out)
            if not isinstance(items, list) or len(items) == 0:
                return None

            # Index by entity_id for lookup
            llm_map: dict[str, dict] = {}
            for item in items:
                eid = item.get("entity_id", "")
                if eid:
                    llm_map[eid] = item

            results: list[ContextualEvaluation] = []
            for entity in entities:
                if entity.entity_id in llm_map:
                    parsed = llm_map[entity.entity_id]
                    try:
                        severity = SeverityLevel(parsed.get("severity_level", "low").lower())
                        results.append(ContextualEvaluation(
                            entity_id=entity.entity_id,
                            is_sensitive=bool(parsed.get("is_sensitive", True)),
                            severity_level=severity,
                            confidence_score=float(parsed.get("confidence_score", entity.confidence_score)),
                            reasoning=str(parsed.get("reasoning", "LLM batch decision.")),
                        ))
                        continue
                    except Exception:
                        pass
                # Fallback for this entity
                results.append(self._heuristic_fallback(entity))
            return results
        except Exception:
            self._api_available = False  # mark as down, skip future calls
            return None

    async def discover_additional_pii(self, full_text: str, already_found: list[str]) -> list[DetectedEntity]:
        """Use LLM as a catch-all to discover PII not found by regex/Presidio.

        Splits the text into overlapping chunks so items near the end of long
        documents (e.g. back side of an Aadhaar card) are not lost to truncation.
        """
        from uuid import uuid4
        from app.domain.models import LocationReference

        if not await self._is_api_reachable() or not full_text.strip():
            return []

        # --- chunk the text so nothing gets truncated ---
        CHUNK_SIZE = 4000
        OVERLAP = 400
        chunks: list[tuple[int, str]] = []  # (offset, text)
        start = 0
        while start < len(full_text):
            end = start + CHUNK_SIZE
            chunks.append((start, full_text[start:end]))
            start = end - OVERLAP
            if start >= len(full_text):
                break

        all_additional: list[DetectedEntity] = []
        seen_values: set[str] = set()

        for chunk_offset, chunk_text in chunks:
            already_str = ", ".join(already_found[:30]) if already_found else "none"
            prompt = (
                "You are an Expert Data Privacy and Security Auditor.\n"
                "Your objective is to thoroughly scan the text for ANY sensitive data, credentials, financial records, or personal identifiers that a traditional regex scanner might have missed.\n"
                "Consider high-value external targets for attackers such as bespoke authentication tokens (AWS/GCP structures), healthcare ICD-10 codes, proprietary intellectual property tags, unformatted physical addresses, contextual names (e.g., 'Client: John'), or internal project codes if marked confidential.\n"
                "Evaluate findings according to global privacy frameworks (GDPR, HIPAA, CCPA, PCI-DSS) and consider how a malicious external actor could exploit them.\n"
                "DO NOT extract any data that is already in this list of already-detected values: [" + already_str + "].\n"
                "Return strict JSON: a list of objects with keys: "
                'type (string, e.g. "name", "address", "dob", "signature", "account_number", etc.), '
                "value (the exact text found), "
                "is_sensitive (boolean), "
                'severity_level ("high"|"medium"|"low"), '
                "confidence_score (0..1), "
                "reasoning (string explain WHY this is a risk, citing regulatory frameworks or attacker exploitation value).\n"
                "Return [] if nothing new found. No markdown, no extra prose.\n\n"
                "CRITICAL: Only extract EXACT substrings that appear in the text. Do not hallucinate or format the values.\n\n"
                f"Text to analyze:\n{chunk_text}"
            )

            url = f"{self.settings.aipipe_base_url}/openrouter/v1/responses"
            headers = {
                "Authorization": f"Bearer {self.settings.aipipe_token}",
                "Content-Type": "application/json",
            }
            payload = {"model": self.settings.aipipe_model, "input": prompt}

            try:
                client = await self._get_client()
                response = await client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()
                text_out = self._extract_output_text(data)
                items = json.loads(text_out)
                if not isinstance(items, list):
                    continue

                for item in items:
                    value = str(item.get("value", "")).strip()
                    if not value or not item.get("is_sensitive", False):
                        continue
                    # Instead of absolute finditer which breaks page-bounds,
                    # yield a single abstract entity. `_propagate_entities` will
                    # correctly materialize it across all pages and proper bboxes.
                    if value in seen_values:
                        continue
                    seen_values.add(value)
                    
                    loc = LocationReference(page=1)
                    all_additional.append(
                        DetectedEntity(
                            entity_id=uuid4().hex,
                            type=f"llm_{item.get('type', 'unknown')}".lower(),
                            raw_value=value,
                            location_reference=loc,
                            confidence_score=min(float(item.get("confidence_score", 0.7)), 1.0),
                        )
                    )
            except Exception:
                continue

        return all_additional

    def _extract_output_text(self, payload: dict) -> str:
        output = payload.get("output", [])
        if not output:
            return "{}"
        content = output[0].get("content", [])
        if not content:
            return "{}"
        text = content[0].get("text")
        return text if isinstance(text, str) else "{}"

    def _heuristic_fallback(self, entity: DetectedEntity) -> ContextualEvaluation:
        high_tokens = {
            # Identity documents
            "credit_card", "aadhaar", "aadhaar_vid", "aadhaar_enrolment",
            "ssn", "iban", "bank_account", "pan", "passport",
            "passport_in", "passport_us", "passport_eu",
            "driving_license", "voter_id", "face", "qr_code",
            "date_of_birth", "parent_name",
            # Financial
            "credit_card_visa", "credit_card_mastercard", "credit_card_amex",
            "credit_card_discover", "credit_card_diners", "credit_card_jcb",
            "credit_card_rupay", "credit_card_generic",
            "bank_account_in", "gstin", "cin",
            # International IDs
            "nino_uk", "sin_ca", "tfn_au", "cpf_br", "curp_mx",
            "rrn_kr", "nric_sg", "hkid", "sa_id", "itin_us",
            # Credentials & secrets
            "aws_access_key", "aws_secret_key", "google_api_key",
            "github_pat", "stripe_key", "private_key", "jwt_token",
            "api_key_generic", "password_in_config",
            # Medical
            "medicare_mbi", "medical_record", "health_insurance_id",
        }
        medium_tokens = {
            "phone_number", "email_address", "email", "phone", "phone_in",
            "address", "upi_id", "ifsc", "swift", "vehicle_reg",
            "pin_code", "gender", "person",
            # India-specific
            "tan", "fssai_license", "ration_card", "epf_uan",
            "epf_member_id", "esic_code", "ein_us",
            "fir_number", "case_number",
            # Technical / network
            "ip_address_v4", "mac_address", "imei",
            "crypto_btc", "crypto_eth",
            # Medical
            "npi_us", "dea_number", "nhs_number",
            # Personal
            "age", "blood_group",
            # Location
            "gps_coordinates", "zip_code_us", "postcode_uk",
        }
        low_not_sensitive = {
            "date_time", "nrp", "location", "url",
            "ip_address_v6", "vin", "license_plate_us",
        }

        entity_type = entity.type.lower()

        # LLM-discovered entities (prefixed with llm_) are sensitive by default
        if entity_type.startswith("llm_"):
            inner = entity_type.removeprefix("llm_")
            if inner in high_tokens or inner in {"name", "dob", "account_number", "signature", "biometric"}:
                severity = SeverityLevel.HIGH
            elif inner in medium_tokens or inner in {"address", "phone", "email"}:
                severity = SeverityLevel.MEDIUM
            else:
                severity = SeverityLevel.MEDIUM
            return ContextualEvaluation(
                entity_id=entity.entity_id,
                is_sensitive=True,
                severity_level=severity,
                confidence_score=min(max(entity.confidence_score, 0.7), 1.0),
                reasoning=f"LLM-discovered: {entity_type} classified as {severity.value}.",
            )

        if entity_type in high_tokens:
            severity = SeverityLevel.HIGH
            sensitive = True
            score = max(entity.confidence_score, 0.85)
        elif entity_type in medium_tokens:
            severity = SeverityLevel.MEDIUM
            sensitive = True
            score = max(entity.confidence_score, 0.7)
        elif entity_type in low_not_sensitive:
            severity = SeverityLevel.LOW
            sensitive = False
            score = entity.confidence_score
        else:
            severity = SeverityLevel.LOW
            sensitive = True
            score = max(entity.confidence_score, 0.55)

        return ContextualEvaluation(
            entity_id=entity.entity_id,
            is_sensitive=sensitive,
            severity_level=severity,
            confidence_score=min(score, 1.0),
            reasoning=f"Heuristic: {entity_type} classified as {severity.value}, sensitive={sensitive}.",
        )
