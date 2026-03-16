package com.example.privacyfirewall.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.privacyfirewall.data.models.R2Object
import com.example.privacyfirewall.data.repository.ApiException
import com.example.privacyfirewall.data.repository.PrivacyRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed class FilesUiState {
    object Loading : FilesUiState()
    data class Success(val files: List<R2Object>) : FilesUiState()
    data class Error(val message: String, val isR2NotConfigured: Boolean = false) : FilesUiState()
}

class FileManagerViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = PrivacyRepository(application.applicationContext)

    private val _uiState = MutableStateFlow<FilesUiState>(FilesUiState.Loading)
    val uiState: StateFlow<FilesUiState> = _uiState

    private val _downloadUrl = MutableStateFlow<String?>(null)
    val downloadUrl: StateFlow<String?> = _downloadUrl

    init {
        loadFiles()
    }

    fun loadFiles() {
        viewModelScope.launch {
            _uiState.value = FilesUiState.Loading
            repository.listFiles().fold(
                onSuccess = { _uiState.value = FilesUiState.Success(it.objects) },
                onFailure = { e ->
                    val isR2 = e is ApiException && e.code == 501
                    _uiState.value = FilesUiState.Error(
                        message = e.message ?: "Failed to load files",
                        isR2NotConfigured = isR2
                    )
                }
            )
        }
    }

    fun refreshDownloadUrl(objectKey: String) {
        viewModelScope.launch {
            repository.getFileDownloadUrl(objectKey).fold(
                onSuccess = { _downloadUrl.value = it.downloadUrl },
                onFailure = { /* handled via snackbar in screen */ }
            )
        }
    }

    fun deleteFile(objectKey: String) {
        viewModelScope.launch {
            repository.deleteFile(objectKey).fold(
                onSuccess = { loadFiles() },
                onFailure = { /* handled via snackbar */ }
            )
        }
    }

    fun clearDownloadUrl() {
        _downloadUrl.value = null
    }
}
