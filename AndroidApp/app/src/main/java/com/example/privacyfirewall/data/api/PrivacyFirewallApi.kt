package com.example.privacyfirewall.data.api

import com.example.privacyfirewall.data.models.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

interface PrivacyFirewallApi {

    // ── Health ──────────────────────────────────────────────────────────────────
    @GET("health")
    suspend fun healthCheck(): Response<HealthResponse>

    // ── One-Shot Process ────────────────────────────────────────────────────────
    @Multipart
    @POST("api/v1/process/document")
    suspend fun processDocument(
        @Part file: MultipartBody.Part,
        @Part("mode") mode: RequestBody,
        @Part("apply_redaction") applyRedaction: RequestBody,
        @Part("score_threshold") scoreThreshold: RequestBody? = null,
        @Part("policy_json") policyJson: RequestBody? = null
    ): Response<ProcessingResponse>

    @Multipart
    @POST("api/v1/process/image")
    suspend fun processImage(
        @Part file: MultipartBody.Part,
        @Part("mode") mode: RequestBody,
        @Part("apply_redaction") applyRedaction: RequestBody,
        @Part("score_threshold") scoreThreshold: RequestBody? = null,
        @Part("policy_json") policyJson: RequestBody? = null
    ): Response<ProcessingResponse>

    @Multipart
    @POST("api/v1/process/audio")
    suspend fun processAudio(
        @Part file: MultipartBody.Part,
        @Part("mode") mode: RequestBody,
        @Part("apply_redaction") applyRedaction: RequestBody,
        @Part("score_threshold") scoreThreshold: RequestBody? = null,
        @Part("policy_json") policyJson: RequestBody? = null
    ): Response<ProcessingResponse>

    // ── Two-Phase Scan ──────────────────────────────────────────────────────────
    @Multipart
    @POST("api/v1/scan/document")
    suspend fun scanDocument(
        @Part file: MultipartBody.Part
    ): Response<ScanResponse>

    @Multipart
    @POST("api/v1/scan/image")
    suspend fun scanImage(
        @Part file: MultipartBody.Part
    ): Response<ScanResponse>

    @Multipart
    @POST("api/v1/scan/audio")
    suspend fun scanAudio(
        @Part file: MultipartBody.Part
    ): Response<ScanResponse>

    // ── Redact ──────────────────────────────────────────────────────────────────
    @POST("api/v1/redact")
    suspend fun redact(
        @Body request: RedactRequest
    ): Response<RedactResponse>

    // ── Detect in Region ────────────────────────────────────────────────────────
    @POST("api/v1/detect/region")
    suspend fun detectInRegion(
        @Body request: RegionDetectRequest
    ): Response<RegionDetectResponse>

    // ── File Storage (R2) ───────────────────────────────────────────────────────
    @GET("api/v1/files")
    suspend fun listFiles(
        @Query("prefix") prefix: String = "redacted/",
        @Query("max_keys") maxKeys: Int = 100
    ): Response<FileListResponse>

    @GET("api/v1/files/{object_key}")
    suspend fun getFileDownloadUrl(
        @Path("object_key", encoded = true) objectKey: String
    ): Response<FileDownloadUrlResponse>

    @DELETE("api/v1/files/{object_key}")
    suspend fun deleteFile(
        @Path("object_key", encoded = true) objectKey: String
    ): Response<FileDeleteResponse>

    // ── Chat ─────────────────────────────────────────────────────────────────────
    @Multipart
    @POST("api/v1/chat")
    suspend fun sendChat(
        @Part("message") message: RequestBody,
        @Part("chat_history") chatHistory: RequestBody? = null,
        @Part("scan_id") scanId: RequestBody? = null,
        @Part file: MultipartBody.Part? = null,
        @Part("use_llm") useLlm: RequestBody? = null
    ): Response<ChatResponse>
}
