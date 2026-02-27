# 🧠 Privacy Firewall Core Engine  
## Context-Aware Privacy Detection, Flagging & Redaction System

---

# 🚀 Overview

The Privacy Firewall Core Engine is an AI-powered backend intelligence system designed to **detect, classify, flag, warn, and optionally redact sensitive information** from multimedia content.

Unlike naive auto-blur tools, this engine supports multiple operational modes:

1. **Detection-Only Mode (Flag Mode)**
2. **Warning + Recommendation Mode**
3. **Automatic Redaction Mode**
4. **Policy-Driven Enforcement Mode**

This makes the engine adaptable across consumer apps, enterprise systems, and compliance-heavy environments.

---

# 🎯 Core Objective

Build a modular backend system that:

- Detects sensitive entities in media
- Assesses contextual privacy risk
- Flags potential exposure
- Generates structured privacy warnings
- Optionally applies redaction
- Produces auditable outputs

---

# 🏗 High-Level Processing Pipeline

```
Input
  ↓
Signal Extraction
  ↓
Entity Detection
  ↓
Contextual Classification
  ↓
Risk Scoring
  ↓
Decision Engine (Flag / Warn / Redact)
  ↓
Redaction Planning (if enabled)
  ↓
Execution (if enabled)
  ↓
Validation
  ↓
Output + Audit Log
```

---

# 🔹 1. Signal Extraction Layer

Extract structured data from input media.

### For Images:
- OCR text + bounding boxes
- Face detection
- Object detection (ID cards, bank cards)

### For PDFs:
- Layout-aware text extraction
- OCR fallback for scanned files

### For Audio:
- Speech-to-text transcription
- Timestamp alignment

Output:
```
{
  text_segments,
  bounding_boxes,
  faces,
  objects,
  timestamps
}
```

---

# 🔹 2. Entity Detection Engine

Performs deterministic pattern detection:

- Emails
- Phone numbers
- Credit card numbers (Luhn validation)
- Aadhaar / SSN formats
- Bank accounts
- IFSC / SWIFT
- UPI IDs
- Addresses (heuristic detection)

Each entity is tagged with:

```
{
  entity_id,
  type,
  raw_value,
  location_reference,
  confidence_score
}
```

---

# 🔹 3. Contextual Intelligence Engine

Prevents blind redaction.

Uses LLM reasoning + contextual metadata to determine:

- Is this truly sensitive?
- Is it personal or generic?
- Is it publicly safe?
- What is the severity level?

Example:
- 16-digit number near “Expiry” → High risk
- 16-digit parcel ID near “Tracking” → Low risk

Returns:

```
{
  entity_id,
  is_sensitive,
  severity_level,
  confidence_score,
  reasoning
}
```

---

# 🔹 4. Risk Scoring Module

Each sensitive entity is scored:

| Severity | Example |
|----------|----------|
| High     | Credit card, Aadhaar |
| Medium   | Phone number, address |
| Low      | First name only |

Global risk score is computed:

```
document_risk_score = Σ(weight × severity × confidence)
```

This enables decision-making downstream.

---

# 🔹 5. Decision Engine (Core Intelligence Layer)

This is the feature you correctly identified.

The engine supports configurable operating modes:

---

## 🟢 Mode 1: Detection-Only (Flag Mode)

System does NOT alter the media.

Output includes:

```
{
  flagged_entities,
  severity_levels,
  risk_score,
  warning_message
}
```

Use cases:
- Compliance review
- Internal auditing
- Pre-publication risk checks

---

## 🟡 Mode 2: Warning + Recommendation Mode

System flags sensitive areas and recommends redaction but does not execute automatically.

Output includes:

```
{
  flagged_entities,
  recommended_redaction_plan,
  risk_summary
}
```

Use cases:
- Human-in-the-loop workflows
- Enterprise review pipelines

---

## 🔴 Mode 3: Automatic Redaction Mode

System:
- Detects
- Classifies
- Generates redaction blueprint
- Applies transformations automatically

Used when:
- Risk score exceeds threshold
- Policy mandates auto-enforcement

---

## ⚫ Mode 4: Policy-Driven Enforcement Mode

Enterprise configuration rules:

Examples:
- Always redact credit cards
- Only flag phone numbers
- Never redact invoice totals
- Redact faces in public-facing content

This makes the system configurable and enterprise-ready.

---

# 🔹 6. Redaction Planning Engine

Before altering media, the engine generates:

```
{
  redaction_regions,
  audio_timestamps,
  strategy_type,
  reversible_reference_id
}
```

This ensures:
- Auditability
- Traceability
- Rollback capability

---

# 🔹 7. Redaction Execution Engine

Applies transformations based on strategy:

### Image:
- Black overlay
- Blur
- Pixelation

### Text:
- Masking tokens
- Secure deletion

### Audio:
- Bleep insertion
- Silence replacement

---

# 🔹 8. Validation Layer

Post-processing checks:

- Re-run entity detection to confirm removal
- Ensure layout integrity
- Confirm no corruption
- Log decision rationale

---

# 🔹 9. Output Structure

```
{
  mode_used,
  sanitized_media (if applicable),
  flagged_entities,
  redaction_report,
  risk_score,
  audit_log,
  reasoning_trace
}
```

---

# 🧠 Design Philosophy

### 1️⃣ Privacy-Aware, Not Privacy-Aggressive  
Detection and flagging are first-class features.

### 2️⃣ Human Control by Default  
Redaction is optional unless policy enforces it.

### 3️⃣ Context Before Action  
Reason first, modify later.

### 4️⃣ Auditability is Mandatory  
Every decision must be explainable.

---

# 🏁 Final Positioning

The Privacy Firewall Core Engine is not merely a redaction system.

It is a **privacy decision engine** that:

- Detects sensitive information
- Assesses contextual risk
- Flags and warns users
- Optionally enforces redaction
- Produces compliance-ready audit logs

It can operate as:

- A compliance scanner
- A pre-publication privacy checker
- A backend privacy enforcement service
- A modular component in enterprise DLP systems

The intelligence lies not in blurring —  
but in deciding *when*, *what*, and *whether* to blur.

---

# 🛠 Implementation Status (Initial Build)

An initial working backend scaffold is now implemented in this repository with:

- FastAPI service and versioned API routes
- Multi-modal ingestion endpoints (`document`, `image`, `audio`)
- Deterministic PII detection (Presidio + custom recognizers)
- Contextual classification engine with AIPipe OpenAI-compatible `/responses` integration
- Risk scoring + mode-based decision engine
- Redaction planning + execution pipeline (PDF/Image/Audio)
- Structured output with audit logs and reasoning trace

Current code structure:

```
app/
  api/
    dependencies.py
    routes.py
  domain/
    contracts.py
    models.py
  services/
    contextual.py
    decisioning.py
    detectors.py
    extractors.py
    pipeline.py
    redaction.py
  main.py
  settings.py
```

---

# ▶️ Quick Start

## 1) Install dependencies

```bash
pip install -e .
```

## 2) Configure environment variables

Create `.env` in project root:

```env
APP_NAME=Privacy Firewall Core Engine
APP_VERSION=0.1.0
DEBUG=false

AIPIPE_BASE_URL=https://aipipe.org
AIPIPE_TOKEN=your_token_here
AIPIPE_MODEL=gpt-5-nano

DEFAULT_MODE=warn
AUTO_REDACT_THRESHOLD=0.65
```

If `AIPIPE_TOKEN` is missing, contextual classification falls back to heuristics.

## 3) Run API server

```bash
uvicorn app.main:app --host 0.0.0.0 --reload
```

Health endpoint:

```bash
curl http://127.0.0.1:8000/health
```

---

# 🔌 API Endpoints

- `POST /api/v1/process/document`
- `POST /api/v1/process/image`
- `POST /api/v1/process/audio`

Supported form fields:

- `file` (required)
- `mode`: `flag | warn | auto_redact | policy`
- `apply_redaction`: `true/false`
- `score_threshold`: float in `[0,1]`
- `policy_json`: JSON string (for policy mode)

Example:

```bash
curl -X POST http://127.0.0.1:8000/api/v1/process/document \
  -F "file=@sample.pdf" \
  -F "mode=warn" \
  -F "apply_redaction=false"
```

---

# 📦 Optional Runtime Dependencies

Some features rely on optional libraries/tools:

- PDF extraction/redaction: `PyMuPDF` (`fitz`)
- Image OCR: `pytesseract` + system `tesseract`
- Face detection: `opencv-python`
- Audio transcription: `faster-whisper`
- Audio redaction: `pydub` (+ ffmpeg for many formats)

Without these, the engine still runs with partial functionality and graceful fallbacks.
