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
  media_type: string;
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
}

export interface ProcessOptions {
  mode: ProcessingMode;
  apply_redaction?: boolean;
  score_threshold?: number;
  policy_json?: string;
}

export type MediaType = "document" | "image" | "audio";

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
