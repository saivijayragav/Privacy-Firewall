package com.example.privacyfirewall.data.models

import com.google.gson.annotations.SerializedName

// ── Enums ──────────────────────────────────────────────────────────────────────

enum class ProcessingMode(val value: String) {
    @SerializedName("flag")        FLAG("flag"),
    @SerializedName("warn")        WARN("warn"),
    @SerializedName("auto_redact") AUTO_REDACT("auto_redact"),
    @SerializedName("policy")      POLICY("policy");

    override fun toString() = value
}

enum class SeverityLevel {
    @SerializedName("high")   HIGH,
    @SerializedName("medium") MEDIUM,
    @SerializedName("low")    LOW
}

enum class MediaType {
    @SerializedName("document") DOCUMENT,
    @SerializedName("image")    IMAGE,
    @SerializedName("audio")    AUDIO
}

// ── Health ─────────────────────────────────────────────────────────────────────

data class HealthResponse(
    val status: String = ""
)

// ── Location Reference ─────────────────────────────────────────────────────────

data class LocationReference(
    val page: Int? = null,
    val bbox: List<Float>? = null,
    @SerializedName("start_char") val startChar: Int? = null,
    @SerializedName("end_char") val endChar: Int? = null,
    @SerializedName("start_sec") val startSec: Float? = null,
    @SerializedName("end_sec") val endSec: Float? = null
)

// ── Detected Entity ────────────────────────────────────────────────────────────

data class DetectedEntity(
    @SerializedName("entity_id") val entityId: String = "",
    val type: String = "UNKNOWN",
    @SerializedName("raw_value") val rawValue: String = "",
    @SerializedName("location_reference") val locationReference: LocationReference? = null,
    @SerializedName("confidence_score") val confidenceScore: Float = 0f
)

// ── Contextual Evaluation ──────────────────────────────────────────────────────

data class ContextualEvaluation(
    @SerializedName("entity_id") val entityId: String = "",
    @SerializedName("is_sensitive") val isSensitive: Boolean = false,
    @SerializedName("severity_level") val severityLevel: SeverityLevel = SeverityLevel.LOW,
    @SerializedName("confidence_score") val confidenceScore: Float = 0f,
    val reasoning: String = ""
)

// ── Flagged Entity ─────────────────────────────────────────────────────────────

data class FlaggedEntity(
    val detected: DetectedEntity = DetectedEntity(),
    val contextual: ContextualEvaluation = ContextualEvaluation()
)

// ── Redaction ──────────────────────────────────────────────────────────────────

data class RedactionRegion(
    @SerializedName("entity_id") val entityId: String = "",
    @SerializedName("media_type") val mediaType: String = "document",
    @SerializedName("location_reference") val locationReference: LocationReference? = null,
    @SerializedName("strategy_type") val strategyType: String = "blackout"
)

data class RedactionPlan(
    @SerializedName("redaction_regions") val redactionRegions: List<RedactionRegion> = emptyList(),
    @SerializedName("audio_timestamps") val audioTimestamps: List<List<Float>> = emptyList(),
    @SerializedName("strategy_type") val strategyType: String = "blackout",
    @SerializedName("reversible_reference_id") val reversibleReferenceId: String = ""
)

// ── Audit ──────────────────────────────────────────────────────────────────────

data class AuditEvent(
    val stage: String = "",
    val details: Map<String, Any> = emptyMap()
)

// ── Processing Response (One-Shot) ─────────────────────────────────────────────

data class ProcessingResponse(
    @SerializedName("mode_used") val modeUsed: String = "warn",
    @SerializedName("flagged_entities") val flaggedEntities: List<FlaggedEntity> = emptyList(),
    @SerializedName("risk_score") val riskScore: Float = 0f,
    @SerializedName("warning_message") val warningMessage: String? = null,
    @SerializedName("recommended_redaction_plan") val recommendedRedactionPlan: RedactionPlan? = null,
    @SerializedName("redaction_report") val redactionReport: Map<String, Any>? = null,
    @SerializedName("audit_log") val auditLog: List<AuditEvent> = emptyList(),
    @SerializedName("reasoning_trace") val reasoningTrace: List<String> = emptyList(),
    @SerializedName("output_file_path") val outputFilePath: String? = null,
    @SerializedName("object_store_key") val objectStoreKey: String? = null,
    @SerializedName("download_url") val downloadUrl: String? = null
)

// ── Scan Response ──────────────────────────────────────────────────────────────

data class ScanResponse(
    @SerializedName("scan_id") val scanId: String = "",
    @SerializedName("flagged_entities") val flaggedEntities: List<FlaggedEntity> = emptyList(),
    @SerializedName("risk_score") val riskScore: Float = 0f,
    @SerializedName("warning_message") val warningMessage: String? = null,
    @SerializedName("recommended_redaction_plan") val recommendedRedactionPlan: RedactionPlan? = null,
    @SerializedName("audit_log") val auditLog: List<AuditEvent> = emptyList(),
    @SerializedName("reasoning_trace") val reasoningTrace: List<String> = emptyList()
)

// ── Redact Request / Response ──────────────────────────────────────────────────

data class ManualRegion(
    val bbox: List<Float>,
    val page: Int = 1,
    val label: String = ""
)

data class RedactRequest(
    @SerializedName("scan_id") val scanId: String,
    @SerializedName("approved_region_ids") val approvedRegionIds: List<String> = emptyList(),
    @SerializedName("manual_regions") val manualRegions: List<ManualRegion> = emptyList()
)

data class RedactResponse(
    val status: String = "",
    @SerializedName("object_key") val objectKey: String? = null,
    @SerializedName("download_url") val downloadUrl: String? = null,
    val filename: String? = null,
    @SerializedName("local_path") val localPath: String? = null
)

// ── Region Detect ──────────────────────────────────────────────────────────────

data class RegionDetectRequest(
    @SerializedName("scan_id") val scanId: String,
    val bbox: List<Float>,
    val page: Int = 1
)

data class RegionDetectResponse(
    val entities: List<DetectedEntity> = emptyList()
)

// ── File Storage (R2) ──────────────────────────────────────────────────────────

data class R2Object(
    val key: String = "",
    val size: Long = 0,
    @SerializedName("last_modified") val lastModified: String = ""
)

data class FileListResponse(
    val objects: List<R2Object> = emptyList(),
    val count: Int = 0
)

data class FileDownloadUrlResponse(
    @SerializedName("object_key") val objectKey: String = "",
    @SerializedName("download_url") val downloadUrl: String = "",
    @SerializedName("expires_in") val expiresIn: Int = 3600
)

data class FileDeleteResponse(
    val status: String = "",
    @SerializedName("object_key") val objectKey: String = ""
)

// ── Chat ───────────────────────────────────────────────────────────────────────

data class ChatMessage(
    val role: String,   // "user" or "assistant"
    val content: String
)

data class ChatResponse(
    val reply: String = "",
    @SerializedName("scan_id") val scanId: String? = null,
    @SerializedName("has_sensitive_data") val hasSensitiveData: Boolean = false,
    @SerializedName("risk_score") val riskScore: Float? = null,
    @SerializedName("flagged_entities") val flaggedEntities: List<FlaggedEntity> = emptyList()
)

// ── Error ──────────────────────────────────────────────────────────────────────

data class ApiError(
    val detail: String = "Unknown error"
)
