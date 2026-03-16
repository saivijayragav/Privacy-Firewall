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

sealed class ScanUiState {
    object Idle : ScanUiState()
    object Scanning : ScanUiState()
    data class Scanned(val response: ScanResponse) : ScanUiState()
    object Redacting : ScanUiState()
    data class Redacted(val response: RedactResponse) : ScanUiState()
    data class Error(val message: String) : ScanUiState()
}

class ScanReviewViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = PrivacyRepository(application.applicationContext)

    private val _uiState = MutableStateFlow<ScanUiState>(ScanUiState.Idle)
    val uiState: StateFlow<ScanUiState> = _uiState

    private val _selectedUri = MutableStateFlow<Uri?>(null)
    val selectedUri: StateFlow<Uri?> = _selectedUri

    private val _selectedFileType = MutableStateFlow(MediaType.IMAGE)
    val selectedFileType: StateFlow<MediaType> = _selectedFileType

    // Entity approval toggles: entity_id -> approved
    private val _approvedEntities = MutableStateFlow<Map<String, Boolean>>(emptyMap())
    val approvedEntities: StateFlow<Map<String, Boolean>> = _approvedEntities

    // Manual regions drawn by user
    private val _manualRegions = MutableStateFlow<List<ManualRegion>>(emptyList())
    val manualRegions: StateFlow<List<ManualRegion>> = _manualRegions

    // Region detection results
    private val _regionEntities = MutableStateFlow<List<DetectedEntity>>(emptyList())
    val regionEntities: StateFlow<List<DetectedEntity>> = _regionEntities

    fun setSelectedUri(uri: Uri?) { _selectedUri.value = uri }
    fun setSelectedFileType(type: MediaType) { _selectedFileType.value = type }

    fun toggleEntity(entityId: String) {
        val current = _approvedEntities.value.toMutableMap()
        current[entityId] = !(current[entityId] ?: true)
        _approvedEntities.value = current
    }

    fun approveAll() {
        val state = _uiState.value
        if (state is ScanUiState.Scanned) {
            val map = state.response.flaggedEntities.associate {
                it.detected.entityId to true
            }
            _approvedEntities.value = map
        }
    }

    fun rejectAll() {
        val state = _uiState.value
        if (state is ScanUiState.Scanned) {
            val map = state.response.flaggedEntities.associate {
                it.detected.entityId to false
            }
            _approvedEntities.value = map
        }
    }

    fun addManualRegion(region: ManualRegion) {
        _manualRegions.value = _manualRegions.value + region
    }

    fun removeManualRegion(index: Int) {
        _manualRegions.value = _manualRegions.value.toMutableList().apply { removeAt(index) }
    }

    fun scanFile() {
        val uri = _selectedUri.value ?: return
        viewModelScope.launch {
            _uiState.value = ScanUiState.Scanning
            repository.scanFile(uri, _selectedFileType.value).fold(
                onSuccess = { response ->
                    // Auto-approve all entities initially
                    _approvedEntities.value = response.flaggedEntities.associate {
                        it.detected.entityId to true
                    }
                    _uiState.value = ScanUiState.Scanned(response)
                },
                onFailure = { _uiState.value = ScanUiState.Error(it.message ?: "Scan failed") }
            )
        }
    }

    fun redactApproved() {
        val state = _uiState.value
        if (state !is ScanUiState.Scanned) return

        val approvedIds = _approvedEntities.value.filter { it.value }.keys.toList()
        if (approvedIds.isEmpty() && _manualRegions.value.isEmpty()) {
            _uiState.value = ScanUiState.Error("No regions selected for redaction")
            return
        }

        viewModelScope.launch {
            _uiState.value = ScanUiState.Redacting
            repository.redact(
                scanId = state.response.scanId,
                approvedRegionIds = approvedIds,
                manualRegions = _manualRegions.value
            ).fold(
                onSuccess = { _uiState.value = ScanUiState.Redacted(it) },
                onFailure = { _uiState.value = ScanUiState.Error(it.message ?: "Redaction failed") }
            )
        }
    }

    fun detectInRegion(bbox: List<Float>, page: Int = 1) {
        val state = _uiState.value
        if (state !is ScanUiState.Scanned) return

        viewModelScope.launch {
            repository.detectInRegion(state.response.scanId, bbox, page).fold(
                onSuccess = { _regionEntities.value = it.entities },
                onFailure = { /* silently fail for region detection */ }
            )
        }
    }

    fun reset() {
        _uiState.value = ScanUiState.Idle
        _selectedUri.value = null
        _approvedEntities.value = emptyMap()
        _manualRegions.value = emptyList()
        _regionEntities.value = emptyList()
    }
}
