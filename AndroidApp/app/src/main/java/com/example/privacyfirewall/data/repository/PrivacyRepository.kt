package com.example.privacyfirewall.data.repository

import android.content.Context
import android.net.Uri
import com.example.privacyfirewall.data.api.RetrofitClient
import com.example.privacyfirewall.data.models.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Response
import java.io.File
import java.io.FileOutputStream

class PrivacyRepository(private val context: Context) {

    private val api = RetrofitClient.api

    // ── Health ──────────────────────────────────────────────────────────────────

    suspend fun healthCheck(): Result<HealthResponse> = safeApiCall { api.healthCheck() }

    // ── One-Shot Process ────────────────────────────────────────────────────────

    suspend fun processFile(
        uri: Uri,
        fileType: MediaType,
        mode: ProcessingMode,
        applyRedaction: Boolean,
        scoreThreshold: Float? = null,
        policyJson: String? = null
    ): Result<ProcessingResponse> = withContext(Dispatchers.IO) {
        val file = uriToTempFile(uri) ?: return@withContext Result.failure(Exception("Cannot read file"))
        val part = fileToPart(file)
        val modePart = mode.value.toPlainText()
        val redactPart = applyRedaction.toString().toPlainText()
        val thresholdPart = scoreThreshold?.toString()?.toPlainText()
        val policyPart = policyJson?.toPlainText()

        val result = when (fileType) {
            MediaType.DOCUMENT -> safeApiCall { api.processDocument(part, modePart, redactPart, thresholdPart, policyPart) }
            MediaType.IMAGE    -> safeApiCall { api.processImage(part, modePart, redactPart, thresholdPart, policyPart) }
            MediaType.AUDIO    -> safeApiCall { api.processAudio(part, modePart, redactPart, thresholdPart, policyPart) }
        }
        file.delete()
        result
    }

    // ── Two-Phase Scan ──────────────────────────────────────────────────────────

    suspend fun scanFile(uri: Uri, fileType: MediaType): Result<ScanResponse> =
        withContext(Dispatchers.IO) {
            val file = uriToTempFile(uri) ?: return@withContext Result.failure(Exception("Cannot read file"))
            val part = fileToPart(file)
            val result = when (fileType) {
                MediaType.DOCUMENT -> safeApiCall { api.scanDocument(part) }
                MediaType.IMAGE    -> safeApiCall { api.scanImage(part) }
                MediaType.AUDIO    -> safeApiCall { api.scanAudio(part) }
            }
            file.delete()
            result
        }

    // ── Redact ──────────────────────────────────────────────────────────────────

    suspend fun redact(
        scanId: String,
        approvedRegionIds: List<String>,
        manualRegions: List<ManualRegion> = emptyList()
    ): Result<RedactResponse> = safeApiCall {
        api.redact(RedactRequest(scanId, approvedRegionIds, manualRegions))
    }

    // ── Detect in Region ────────────────────────────────────────────────────────

    suspend fun detectInRegion(
        scanId: String,
        bbox: List<Float>,
        page: Int = 1
    ): Result<RegionDetectResponse> = safeApiCall {
        api.detectInRegion(RegionDetectRequest(scanId, bbox, page))
    }

    // ── File Storage ────────────────────────────────────────────────────────────

    suspend fun listFiles(prefix: String = "redacted/", maxKeys: Int = 100): Result<FileListResponse> =
        safeApiCall { api.listFiles(prefix, maxKeys) }

    suspend fun getFileDownloadUrl(objectKey: String): Result<FileDownloadUrlResponse> =
        safeApiCall { api.getFileDownloadUrl(objectKey) }

    suspend fun deleteFile(objectKey: String): Result<FileDeleteResponse> =
        safeApiCall { api.deleteFile(objectKey) }

    // ── Chat ────────────────────────────────────────────────────────────────────

    suspend fun sendChatMessage(
        message: String,
        chatHistory: List<ChatMessage> = emptyList(),
        scanId: String? = null,
        fileUri: Uri? = null,
        useLlm: Boolean = true
    ): Result<ChatResponse> = withContext(Dispatchers.IO) {
        val msgPart = message.toPlainText()
        val historyPart = if (chatHistory.isNotEmpty()) {
            val gson = com.google.gson.Gson()
            gson.toJson(chatHistory.map { mapOf("role" to it.role, "content" to it.content) })
                .toPlainText()
        } else null
        val scanIdPart = scanId?.toPlainText()
        val useLlmPart = useLlm.toString().toPlainText()

        val filePart = if (fileUri != null) {
            val file = uriToTempFile(fileUri)
            file?.let { fileToPart(it) }
        } else null

        safeApiCall { api.sendChat(msgPart, historyPart, scanIdPart, filePart, useLlmPart) }
    }
    // ── Helpers ─────────────────────────────────────────────────────────────────

    private suspend fun <T> safeApiCall(call: suspend () -> Response<T>): Result<T> {
        return try {
            val response = call()
            if (response.isSuccessful) {
                response.body()?.let { Result.success(it) }
                    ?: Result.failure(Exception("Empty response body"))
            } else {
                val errorMsg = when (response.code()) {
                    404 -> "Scan result not found or expired (30-min TTL)"
                    422 -> "Validation error or redaction failed"
                    501 -> "Cloud storage not configured — running in local-only mode"
                    else -> "Server error (${response.code()})"
                }
                Result.failure(ApiException(response.code(), errorMsg))
            }
        } catch (e: java.net.SocketTimeoutException) {
            Result.failure(Exception("Request timed out. Please try again."))
        } catch (e: java.net.ConnectException) {
            Result.failure(Exception("Cannot connect to server. Check if the backend is running."))
        } catch (e: Exception) {
            Result.failure(Exception(e.message ?: "Unknown error occurred"))
        }
    }

    private fun uriToTempFile(uri: Uri): File? {
        return try {
            val resolver = context.contentResolver
            val inputStream = resolver.openInputStream(uri) ?: return null
            
            // Try to figure out the extension
            val mimeType = resolver.getType(uri)
            val extension = android.webkit.MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
            val extStr = if (extension != null) ".$extension" else ""
            
            val fileName = "upload_${System.currentTimeMillis()}$extStr"
            val tempFile = File(context.cacheDir, fileName)
            FileOutputStream(tempFile).use { output ->
                inputStream.copyTo(output)
            }
            inputStream.close()
            tempFile
        } catch (e: Exception) {
            null
        }
    }

    private fun fileToPart(file: File): MultipartBody.Part {
        val mediaType = "application/octet-stream".toMediaTypeOrNull()
        val requestFile = file.asRequestBody(mediaType)
        return MultipartBody.Part.createFormData("file", file.name, requestFile)
    }

    private fun String.toPlainText() =
        this.toRequestBody("text/plain".toMediaTypeOrNull())
}

class ApiException(val code: Int, message: String) : Exception(message)
