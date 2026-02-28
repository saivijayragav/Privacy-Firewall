"""
Privacy Firewall Chatbot Service
─────────────────────────────────
Conversational AI assistant that analyzes uploaded documents for sensitive data.
Uses the existing scan pipeline for detection and an LLM for natural-language responses.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx

from app.domain.models import (
    ChatMessage,
    ChatResponse,
    FlaggedEntity,
    ScanResponse,
)
from app.settings import AppSettings


SYSTEM_PROMPT = """\
You are the Privacy Firewall Assistant — a helpful, concise AI that helps users \
understand whether their documents contain sensitive or personally identifiable \
information (PII).

When a document has been scanned, you receive the scan results as context.  
Your job is to:
1. Summarise what sensitive data was found (types, count, severity).
2. Explain the risk in plain language.
3. Recommend next steps (e.g. "You can redact these items to protect privacy.").
4. Answer follow-up questions about the findings.

If NO scan results are provided, answer the user's general privacy / PII questions \
to the best of your ability.

Keep answers clear, professional, and under 300 words unless the user asks for detail.
Always be honest — if you are unsure, say so.
"""


class ChatbotService:
    """Stateless service that turns scan results + user messages into LLM-powered chat replies."""

    def __init__(self, settings: AppSettings) -> None:
        self.settings = settings

    # ── public API ───────────────────────────────────────────────────

    async def chat(
        self,
        user_message: str,
        history: list[ChatMessage] | None = None,
        scan_result: ScanResponse | None = None,
    ) -> ChatResponse:
        """
        Generate a conversational reply using LangChain.

        Parameters
        ----------
        user_message : str
            The latest message from the user.
        history : list[ChatMessage] | None
            Prior conversation turns (oldest-first).
        scan_result : ScanResponse | None
            If a file was scanned in this request, pass the result so the LLM
            can reference it.
        """
        try:
            from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
            from langchain_core.messages import HumanMessage, AIMessage
            from app.services.llm import get_langchain_llm

            # Format History
            chat_history = []
            if history:
                for m in history:
                    if m.role == "user":
                        chat_history.append(HumanMessage(content=m.content))
                    else:
                        chat_history.append(AIMessage(content=m.content))
            
            # Format Context
            scan_context = "No scan results provided."
            if scan_result:
                scan_context = self._format_scan_context(scan_result)

            prompt = ChatPromptTemplate.from_messages([
                ("system", SYSTEM_PROMPT + "\n\nAnalyzed Data Context:\n{scan_context}"),
                MessagesPlaceholder(variable_name="chat_history"),
                ("user", "{user_message}")
            ])

            llm = get_langchain_llm(self.settings)
            chain = prompt | llm

            response = await chain.ainvoke({
                "scan_context": scan_context,
                "chat_history": chat_history,
                "user_message": user_message
            })
            reply_text = response.content
        except Exception as e:
            import logging
            logging.error(f"Chatbot LLM Error: {e}")
            reply_text = self._fallback_reply(user_message, scan_result)

        # Build the response, attaching scan metadata if available.
        return ChatResponse(
            reply=reply_text,
            scan_id=scan_result.scan_id if scan_result else None,
            has_sensitive_data=(
                len(scan_result.flagged_entities) > 0 if scan_result else False
            ),
            risk_score=scan_result.risk_score if scan_result else None,
            flagged_entities=scan_result.flagged_entities if scan_result else [],
        )

    # ── internals ────────────────────────────────────────────────────

    @staticmethod
    def _format_scan_context(scan: ScanResponse) -> str:
        """Convert scan results into a concise text block for the LLM context."""
        lines = [
            "── Document Scan Results ──",
            f"Scan ID: {scan.scan_id}",
            f"Risk Score: {scan.risk_score:.2f} ({int(scan.risk_score * 100)}%)",
            f"Total Flagged Entities: {len(scan.flagged_entities)}",
        ]
        if scan.warning_message:
            lines.append(f"Warning: {scan.warning_message}")

        if scan.flagged_entities:
            lines.append("\nDetected Entities:")
            for i, fe in enumerate(scan.flagged_entities, 1):
                d = fe.detected
                c = fe.contextual
                # Mask the raw value for the LLM to avoid leaking PII into its context
                masked = d.raw_value[:3] + "***" if len(d.raw_value) > 3 else "***"
                lines.append(
                    f"  {i}. Type: {d.type} | Masked Value: {masked} | "
                    f"Severity: {c.severity_level} | Confidence: {c.confidence_score:.0%} | "
                    f"Reasoning: {c.reasoning}"
                )

        lines.append(
            "\nThe user can choose to redact these items.  "
            "If they want to, direct them to the redact functionality."
        )
        return "\n".join(lines)



    @staticmethod
    def _fallback_reply(user_message: str, scan_result: ScanResponse | None) -> str:
        """
        Produce a useful reply even when the LLM API is unavailable.
        """
        if scan_result is None:
            return (
                "I can help you check documents for sensitive data. "
                "Please upload a file and I'll analyze it for personally identifiable information (PII), "
                "such as names, ID numbers, phone numbers, and more."
            )

        n = len(scan_result.flagged_entities)
        risk_pct = int(scan_result.risk_score * 100)

        if n == 0:
            return (
                "✅ **No sensitive data detected.** "
                "The document appears to be safe. "
                f"Risk score: {risk_pct}%."
            )

        # Group by entity type
        type_counts: dict[str, int] = {}
        for fe in scan_result.flagged_entities:
            t = fe.detected.type.replace("_", " ").title()
            type_counts[t] = type_counts.get(t, 0) + 1

        summary_items = [f"  • **{t}**: {c}" for t, c in sorted(type_counts.items(), key=lambda x: -x[1])]
        summary = "\n".join(summary_items)

        severity_counts = {"high": 0, "medium": 0, "low": 0}
        for fe in scan_result.flagged_entities:
            severity_counts[fe.contextual.severity_level] = (
                severity_counts.get(fe.contextual.severity_level, 0) + 1
            )

        return (
            f"⚠️ **{n} sensitive item{'s' if n != 1 else ''} detected** "
            f"with an overall risk score of **{risk_pct}%**.\n\n"
            f"**Breakdown by type:**\n{summary}\n\n"
            f"**Severity:** {severity_counts['high']} high, "
            f"{severity_counts['medium']} medium, {severity_counts['low']} low.\n\n"
            "I recommend **redacting** the flagged items to protect privacy. "
            "You can proceed to the redaction page to review and apply redactions."
        )
