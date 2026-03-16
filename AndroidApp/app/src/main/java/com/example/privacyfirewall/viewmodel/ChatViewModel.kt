package com.example.privacyfirewall.viewmodel

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.privacyfirewall.data.models.ChatMessage
import com.example.privacyfirewall.data.models.ChatResponse
import com.example.privacyfirewall.data.models.FlaggedEntity
import com.example.privacyfirewall.data.repository.PrivacyRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class UiChatMessage(
    val id: Long = System.nanoTime(),
    val role: String,           // "user" | "assistant"
    val content: String,
    val riskScore: Float? = null,
    val hasSensitiveData: Boolean = false,
    val flaggedEntities: List<FlaggedEntity> = emptyList(),
    val attachmentName: String? = null
)

class ChatViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = PrivacyRepository(application.applicationContext)

    private val _messages = MutableStateFlow<List<UiChatMessage>>(emptyList())
    val messages: StateFlow<List<UiChatMessage>> = _messages

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    private val _pendingFile = MutableStateFlow<Uri?>(null)
    val pendingFile: StateFlow<Uri?> = _pendingFile

    private val _pendingFileName = MutableStateFlow<String?>(null)
    val pendingFileName: StateFlow<String?> = _pendingFileName

    // ── Session ─────────────────────────────────────────────────────────────
    private var currentScanId: String? = null
    private var sessionFileUri: Uri? = null  // Keep the file around for re-sending

    private val _sessionFileName = MutableStateFlow<String?>(null)
    val sessionFileName: StateFlow<String?> = _sessionFileName

    private val _hasActiveSession = MutableStateFlow(false)
    val hasActiveSession: StateFlow<Boolean> = _hasActiveSession

    fun attachFile(uri: Uri, displayName: String?) {
        _pendingFile.value = uri
        _pendingFileName.value = displayName ?: "file"
    }

    fun clearAttachment() {
        _pendingFile.value = null
        _pendingFileName.value = null
    }

    fun clearError() {
        _error.value = null
    }

    fun startNewSession() {
        currentScanId = null
        sessionFileUri = null
        _sessionFileName.value = null
        _hasActiveSession.value = false
        _messages.value = emptyList()
        _error.value = null
        clearAttachment()
    }

    fun sendMessage(text: String) {
        if (text.isBlank() && _pendingFile.value == null && sessionFileUri == null) return

        val userMsg = UiChatMessage(
            role = "user",
            content = text.ifBlank { "📎 Sent a file for analysis" },
            attachmentName = _pendingFileName.value
        )
        _messages.value = _messages.value + userMsg

        // Use newly attached file, or fall back to the session file for continuity
        val fileUri = _pendingFile.value ?: sessionFileUri
        val uploadedFileName = _pendingFileName.value
        clearAttachment()

        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null

            val history = _messages.value
                .filter { it.role == "user" || it.role == "assistant" }
                .map { ChatMessage(role = it.role, content = it.content) }

            repository.sendChatMessage(
                message = text,
                chatHistory = history.dropLast(1), // exclude current user msg already sent
                scanId = currentScanId,
                fileUri = fileUri,
                useLlm = true
            ).fold(
                onSuccess = { response ->
                    if (response.scanId != null) {
                        currentScanId = response.scanId
                        // Store the file URI for re-sending in follow-up messages
                        if (sessionFileUri == null && fileUri != null) {
                            sessionFileUri = fileUri
                        }
                        if (uploadedFileName != null) _sessionFileName.value = uploadedFileName
                        _hasActiveSession.value = true
                    }
                    val botMsg = UiChatMessage(
                        role = "assistant",
                        content = response.reply,
                        riskScore = response.riskScore,
                        hasSensitiveData = response.hasSensitiveData,
                        flaggedEntities = response.flaggedEntities
                    )
                    _messages.value = _messages.value + botMsg
                },
                onFailure = { e ->
                    _error.value = e.message ?: "Failed to get response"
                    val errorMsg = UiChatMessage(
                        role = "assistant",
                        content = "⚠️ ${e.message ?: "Something went wrong. Please try again."}"
                    )
                    _messages.value = _messages.value + errorMsg
                }
            )
            _isLoading.value = false
        }
    }
}
