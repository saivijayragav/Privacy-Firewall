package com.example.privacyfirewall.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.privacyfirewall.data.models.HealthResponse
import com.example.privacyfirewall.data.repository.PrivacyRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed class HealthState {
    object Checking : HealthState()
    data class Online(val response: HealthResponse) : HealthState()
    data class Offline(val error: String) : HealthState()
}

class HomeViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = PrivacyRepository(application.applicationContext)

    private val _healthState = MutableStateFlow<HealthState>(HealthState.Checking)
    val healthState: StateFlow<HealthState> = _healthState

    init {
        checkHealth()
    }

    fun checkHealth() {
        viewModelScope.launch {
            _healthState.value = HealthState.Checking
            repository.healthCheck().fold(
                onSuccess = { _healthState.value = HealthState.Online(it) },
                onFailure = { _healthState.value = HealthState.Offline(it.message ?: "Unknown error") }
            )
        }
    }
}
