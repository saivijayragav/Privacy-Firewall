const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type ProcessingMode = "flag" | "warn" | "auto_redact" | "policy";

export interface LocationReference {
  page?: number;
  bbox?: number[];
  start_char?: number;
  end_char?: number;
  start_sec?: number;
  end_sec?: number;
}

export interface DetectedEntity {
  entity_id: string;
  type: string;
  raw_value: string;
  location_reference: LocationReference;
  confidence_score: number;
}

export interface ContextualEvaluation {
  entity_id: string;
  is_sensitive: boolean;
  severity_level: "high" | "medium" | "low";
  confidence_score: number;
  reasoning: string;
}

export interface FlaggedEntity {
  detected: DetectedEntity;
  contextual: ContextualEvaluation;
}

export interface RedactionRegion {
  entity_id: string;
  media_type: MediaType;
  location_reference: LocationReference;
  strategy_type: string;
}

export interface RedactionPlan {
  redaction_regions: RedactionRegion[];
  audio_timestamps: [number, number][];
  strategy_type: string;
  reversible_reference_id: string;
}

export interface AuditEvent {
  stage: string;
  details: Record<string, unknown>;
}

export interface ProcessingResponse {
  mode_used: ProcessingMode;
  flagged_entities: FlaggedEntity[];
  risk_score: number;
  warning_message?: string;
  recommended_redaction_plan?: RedactionPlan;
  redaction_report?: Record<string, unknown>;
  audit_log: AuditEvent[];
  reasoning_trace: string[];
  output_file_path?: string;
  object_store_key?: string;
  download_url?: string;
}

export interface ScanResponse {
  scan_id: string;
  flagged_entities: FlaggedEntity[];
  risk_score: number;
  warning_message?: string;
  recommended_redaction_plan?: RedactionPlan;
  audit_log: AuditEvent[];
  reasoning_trace: string[];
}

export interface ManualRegion {
  bbox: number[];
  page?: number;
  label?: string;
}

export interface RedactRequest {
  scan_id: string;
  approved_region_ids: string[];
  manual_regions?: ManualRegion[];
}

export interface RedactResponse {
  status: string;
  object_key?: string;
  download_url?: string;
  filename?: string;
  local_path?: string;
}

export interface RegionDetectRequest {
  scan_id: string;
  bbox: number[];
  page?: number;
}

export interface RegionDetectResponse {
  entities: DetectedEntity[];
}

export interface ProcessOptions {
  mode: ProcessingMode;
  apply_redaction?: boolean;
  score_threshold?: number;
  policy_json?: string;
  use_llm?: boolean;
}

export type MediaType = "document" | "image" | "audio";

// Phase 1 / Single-pass API
export async function processFile(
  file: File,
  mediaType: MediaType,
  options: ProcessOptions
): Promise<ProcessingResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", options.mode);
  formData.append("apply_redaction", String(options.apply_redaction ?? false));
  if (options.score_threshold !== undefined) {
    formData.append("score_threshold", String(options.score_threshold));
  }
  if (options.policy_json) {
    formData.append("policy_json", options.policy_json);
  }
  formData.append("use_llm", String(options.use_llm ?? true));

  const res = await fetch(`${API_BASE}/api/v1/process/${mediaType}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

// Phase 2 APIs: Scan (detect only)
export async function scanFile(file: File, mediaType: MediaType, useLlm: boolean = true): Promise<ScanResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("use_llm", String(useLlm));
  const res = await fetch(`${API_BASE}/api/v1/scan/${mediaType}`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

// Phase 2 APIs: Redact (apply regions to a scanned file)
export async function redactFile(req: RedactRequest): Promise<RedactResponse> {
  const res = await fetch(`${API_BASE}/api/v1/redact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

// Phase 2 APIs: Detect inside a manual region
export async function detectRegion(req: RegionDetectRequest): Promise<RegionDetectResponse> {
  const res = await fetch(`${API_BASE}/api/v1/detect/region`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

// File / Storage APIs
export async function getFileUrl(objectKey: string): Promise<{ download_url: string; expires_in: number }> {
  const res = await fetch(`${API_BASE}/api/v1/files/${encodeURIComponent(objectKey)}`);
  if (!res.ok) throw new Error("Failed to get file URL");
  return res.json();
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export interface ScanStats {
  entity_counts: Record<string, number>;
  total_scans: number;
  avg_risk_score: number;
  high_risk_scans: number;
}

export interface PolicyRecommendation {
  entity_type: string;
  action: "redact" | "ignore" | "review";
  reason: string;
}

export interface AutoPolicyResponse {
  always_redact: string[];
  ignore: string[];
  recommendations: PolicyRecommendation[];
  reasoning: string;
}

export async function generateAutoPolicy(
  stats: ScanStats
): Promise<AutoPolicyResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auto-policy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stats),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

export interface ReportRequest {
  filename: string;
  media_type: string;
  risk_score: number;
  flagged_entities: Array<{
    type: string;
    raw_value: string;
    severity: string;
    reasoning: string;
  }>;
}

export async function generateComplianceReport(
  req: ReportRequest
): Promise<{ report_markdown: string }> {
  const res = await fetch(`${API_BASE}/api/v1/compliance-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

export interface SuggestionRequest {
  filename: string;
  media_type: string;
  risk_score: number;
  flagged_entities: Array<{
    type: string;
    raw_value: string;
    severity: string;
    reasoning: string;
  }>;
}

export async function getPrivacySuggestions(
  req: SuggestionRequest
): Promise<{ suggestions: string[] }> {
  const res = await fetch(`${API_BASE}/api/v1/privacy-suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json();
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  chat_history?: ChatMessage[];
  scan_id?: string;
  file?: File;
  use_llm?: boolean;
}

export interface ChatResponse {
  reply: string;
  scan_id?: string;
  has_sensitive_data: boolean;
  risk_score?: number;
  flagged_entities: Array<{
    detected: { type: string; raw_value: string };
    contextual: { severity_level: string; confidence_score: number; reasoning: string };
  }>;
}

export async function chatWithAgent(req: ChatRequest): Promise<ChatResponse> {
  const formData = new FormData();
  formData.append("message", req.message);
  
  if (req.chat_history && req.chat_history.length > 0) {
    formData.append("chat_history", JSON.stringify(req.chat_history));
  }
  if (req.scan_id) {
    formData.append("scan_id", req.scan_id);
  }
  if (req.file) {
    formData.append("file", req.file);
  }
  
  // Default use_llm to true for chatbot
  formData.append("use_llm", req.use_llm !== undefined ? String(req.use_llm) : "true");

  const res = await fetch(`${API_BASE}/api/v1/chat`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chat API error ${res.status}: ${text}`);
  }

  return res.json();
}
