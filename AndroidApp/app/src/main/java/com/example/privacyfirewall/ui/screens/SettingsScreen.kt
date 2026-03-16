package com.example.privacyfirewall.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.privacyfirewall.BuildConfig
import com.example.privacyfirewall.ui.components.GlassCard
import com.example.privacyfirewall.ui.theme.*

@Composable
fun SettingsScreen(
    onBack: () -> Unit = {}
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DeepNavy)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
    ) {
        Spacer(modifier = Modifier.height(16.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, "Back", tint = TextPrimary)
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                "Settings",
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Bold, color = TextPrimary
                )
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        // ── Server Configuration ────────────────────────────────────────
        Text("SERVER CONNECTION", style = sectionHeaderStyle())
        Spacer(modifier = Modifier.height(8.dp))
        GlassCard {
            Column(modifier = Modifier.padding(16.dp)) {
                SettingsRow(Icons.Filled.Dns, "API Server", BuildConfig.API_BASE_URL)
                HorizontalDivider(color = DividerColor, modifier = Modifier.padding(vertical = 12.dp))
                SettingsRow(Icons.Filled.Timer, "Timeout", "120s read / 120s write")
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // ── Privacy & Security ──────────────────────────────────────────
        Text("PRIVACY & SECURITY", style = sectionHeaderStyle())
        Spacer(modifier = Modifier.height(8.dp))
        GlassCard {
            Column(modifier = Modifier.padding(16.dp)) {
                SettingsRow(Icons.Filled.CleaningServices, "Temp Files", "Auto-deleted after upload")
                HorizontalDivider(color = DividerColor, modifier = Modifier.padding(vertical = 12.dp))
                SettingsRow(Icons.Filled.Cloud, "Cloud Storage", "Cloudflare R2 (if configured)")
                HorizontalDivider(color = DividerColor, modifier = Modifier.padding(vertical = 12.dp))
                SettingsRow(Icons.Filled.HistoryToggleOff, "File TTL", "Scan data expires after 30 min")
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // ── About ──────────────────────────────────────────────
        Text("ABOUT", style = sectionHeaderStyle())
        Spacer(modifier = Modifier.height(8.dp))
        GlassCard {
            Column(modifier = Modifier.padding(16.dp)) {
                SettingsRow(Icons.Filled.Info, "Version", "1.0.0")
            }
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun SettingsRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(CyanAccent.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = CyanAccent, modifier = Modifier.size(18.dp))
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.titleSmall.copy(color = TextPrimary, fontWeight = FontWeight.Medium))
            Text(value, style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary))
        }
    }
}

@Composable
private fun sectionHeaderStyle() = MaterialTheme.typography.labelMedium.copy(
    color = TextTertiary, letterSpacing = 2.sp, fontWeight = FontWeight.SemiBold
)
