# Privacy Firewall API Documentation

The backend service runs a FastAPI server typically hosted at `http://localhost:8000`. All core processing endpoints are listed below.

Most endpoints require `multipart/form-data` to handle file uploads.

---

## Processing Endpoints (One-Shot)

These endpoints upload a file, scan it, and optionally apply redaction policies returning the final result (and download URLs) in one request.

### `POST /api/v1/process/document`

### `POST /api/v1/process/image`

### `POST /api/v1/process/audio`

**Parameters (Form Data):**

- `file` (UploadFile): The file to process.
- `mode` (string): The processing mode. Accepts: `"flag"`, `"warn"`, `"auto_redact"`, `"policy"`. (Default: `"warn"`)
- `apply_redaction` (bool): If `true`, the file will be mutated/redacted based on the mode. (Default: `false`)
- `score_threshold` (float, optional): Override the minimum confidence score required to flag an entity.
- `policy_json` (string, optional): A JSON-stringified policy object to enforce (used when mode is `"policy"`).
- `use_llm` (bool): Whether to use the LLM to contextually verify flagged PII. (Default: `true`)

**Returns:** `ProcessingResponse`

```json
{
  "status": "success",
  "scan_results": {
    /* ScanResponse object */
  },
  "redaction_results": {
    /* RedactResponse object (if apply_redaction was true) */
  }
}
```

---

## Two-Phase Pipeline: Scan & Redact

For interactive UIs where the user uploads a file, reviews the flagged entities, and then manually chooses what to redact.

### `POST /api/v1/scan/document`

### `POST /api/v1/scan/image`

### `POST /api/v1/scan/audio`

Analyzes a file without altering it and returns a `ScanResponse` containing a unique `scan_id`.

**Parameters (Form Data):**

- `file` (UploadFile): The file to scan.
- `use_llm` (bool): Default `true`.

**Returns:** `ScanResponse`

```json
{
  "scan_id": "uuid-string",
  "flagged_entities": [
    {
      "entity_id": "uuid-string",
      "detected": { "type": "person", "raw_value": "John Doe", "bbox": [...] },
      "contextual": { "severity_level": "high", "confidence_score": 0.95, "reasoning": "..." }
    }
  ],
  "risk_score": 0.85
}
```

### `POST /api/v1/redact`

Applies redactions to a previously scanned file.

**Parameters (JSON Body):**

- `scan_id` (string): The ID returned from the `/scan` endpoint.
- `approved_region_ids` (list[string], optional): Specific `entity_id` values to redact. If omitted, redacts ALL flagged entities.
- `manual_regions` (list[ManualRegion], optional): User-drawn bounding boxes.

**Returns:** `RedactResponse`

```json
{
  "status": "success",
  "object_key": "redacted/uuid.pdf",
  "download_url": "https://s3.bucket/url",
  "filename": "redacted.pdf",
  "local_path": "/absolute/path/if/no/cloud"
}
```

---

## File Retrieval & Management (Cloudflare R2)

### `GET /api/v1/files/{object_key}`

Generates a fresh presigned download URL for a stored file.
**Returns:** `{"object_key": "...", "download_url": "...", "expires_in": 3600}`

### `GET /api/v1/files`

Lists stored files.
**Query Params:** `prefix` (string), `max_keys` (int)

### `DELETE /api/v1/files/{object_key}`

Deletes a file from remote storage.

### `GET /api/v1/download?path=/absolute/local/path`

Downloads a locally persisted file (instead of cloud retrieval).

---

## Intelligent AI Helpers (AIPipe)

### `POST /api/v1/auto-policy`

Accepts scan statistics and uses an LLM to generate an optimized redaction policy.
**Parameters JSON:** `{ "total_scans": 100, "avg_risk_score": 0.4, "high_risk_scans": 12, "entity_counts": {"person": 50} }`
**Returns:** JSON Object mapping `always_redact`, `ignore`, and specific `recommendations`.

### `POST /api/v1/compliance-report`

Generates a professional Markdown risk report for a specific scan.
**Parameters JSON:** `ReportRequest` (filename, media_type, risk_score, flagged_entities)
**Returns:** `{ "report_markdown": "# Privacy Report..." }`

### `POST /api/v1/privacy-suggestions`

Generates 2-3 short, actionable privacy warnings (e.g., "This looks like a resume. Redact the phone number").
**Parameters JSON:** `SuggestionRequest` (same structure as ReportRequest)
**Returns:** `{ "suggestions": ["Consider redacting X...", "Y is safe..."] }`

### `POST /api/v1/chat`

Conversational UI endpoint interacting with the file context and LLM.

**Parameters (Form Data):**

- `message` (string): The user's prompt.
- `chat_history` (string, optional): JSON array of prior messages `[{"role": "user", "content": "..."}]`.
- `scan_id` (string, optional): An existing scan ID to ask questions about.
- `file` (UploadFile, optional): A new file to analyze.
- `use_llm` (bool, default `true`).

**Returns:** `ChatResponse`

```json
{
  "reply": "I analyzed your document. I found 3 sensitive items...",
  "scan_id": "uuid-string",
  "has_sensitive_data": true,
  "risk_score": 0.75,
  "flagged_entities": [ ... ]
}
```
