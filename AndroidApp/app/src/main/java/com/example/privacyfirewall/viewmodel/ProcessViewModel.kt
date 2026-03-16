package com.example.privacyfirewall.viewmodel

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.privacyfirewall.data.models.*
import com.example.privacyfirewall.data.repository.PrivacyRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed class ProcessUiState {
    object Idle : ProcessUiState()
    object Processing : ProcessUiState()
    data class Success(val response: ProcessingResponse) : ProcessUiState()
    data class Error(val message: String) : ProcessUiState()
}

class ProcessViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = PrivacyRepository(application.applicationContext)

    private val _uiState = MutableStateFlow<ProcessUiState>(ProcessUiState.Idle)
    val uiState: StateFlow<ProcessUiState> = _uiState

    // User selections
    private val _selectedMode = MutableStateFlow(ProcessingMode.WARN)
    val selectedMode: StateFlow<ProcessingMode> = _selectedMode

    private val _applyRedaction = MutableStateFlow(false)
    val applyRedaction: StateFlow<Boolean> = _applyRedaction

    private val _scoreThreshold = MutableStateFlow<Float?>(null)
    val scoreThreshold: StateFlow<Float?> = _scoreThreshold

    private val _policyJson = MutableStateFlow<String?>(null)
    val policyJson: StateFlow<String?> = _policyJson

    private val _selectedUri = MutableStateFlow<Uri?>(null)
    val selectedUri: StateFlow<Uri?> = _selectedUri

    private val _selectedFileType = MutableStateFlow(MediaType.IMAGE)
    val selectedFileType: StateFlow<MediaType> = _selectedFileType

    fun setMode(mode: ProcessingMode) { _selectedMode.value = mode }
    fun setApplyRedaction(value: Boolean) { _applyRedaction.value = value }
    fun setScoreThreshold(value: Float?) { _scoreThreshold.value = value }
    fun setPolicyJson(value: String?) { _policyJson.value = value }
    fun setSelectedUri(uri: Uri?) { _selectedUri.value = uri }
    fun setSelectedFileType(type: MediaType) { _selectedFileType.value = type }

    fun processFile() {
        val uri = _selectedUri.value ?: return
        viewModelScope.launch {
            _uiState.value = ProcessUiState.Processing
            repository.processFile(
                uri = uri,
                fileType = _selectedFileType.value,
                mode = _selectedMode.value,
                applyRedaction = _applyRedaction.value,
                scoreThreshold = _scoreThreshold.value,
                policyJson = _policyJson.value
            ).fold(
                onSuccess = { _uiState.value = ProcessUiState.Success(it) },
                onFailure = { _uiState.value = ProcessUiState.Error(it.message ?: "Processing failed") }
            )
        }
    }

    fun reset() {
        _uiState.value = ProcessUiState.Idle
        _selectedUri.value = null
    }
}
