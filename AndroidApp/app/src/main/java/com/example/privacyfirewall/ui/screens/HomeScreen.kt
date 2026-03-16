package com.example.privacyfirewall.ui.screens

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.privacyfirewall.ui.components.GlassCard
import com.example.privacyfirewall.ui.theme.*
import com.example.privacyfirewall.viewmodel.HealthState
import com.example.privacyfirewall.viewmodel.HomeViewModel

@Composable
fun HomeScreen(
    onNavigateToProcess: () -> Unit = {},
    onNavigateToScan: () -> Unit = {},
    onNavigateToFiles: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    viewModel: HomeViewModel = viewModel()
) {
    val healthState by viewModel.healthState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DeepNavy)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
    ) {
        Spacer(modifier = Modifier.height(24.dp))

        // ── Header ──────────────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Privacy",
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                )
                Text(
                    text = "Firewall",
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontWeight = FontWeight.Bold,
                        color = CyanAccent
                    )
                )
            }
            IconButton(onClick = onNavigateToSettings) {
                Icon(
                    Icons.Filled.Settings,
                    contentDescription = "Settings",
                    tint = TextSecondary
                )
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // ── Health Status ───────────────────────────────────────────────────
        HealthStatusCard(healthState, onRetry = { viewModel.checkHealth() })

        Spacer(modifier = Modifier.height(24.dp))

        // ── Shield Hero ─────────────────────────────────────────────────────
        ShieldHero()

        Spacer(modifier = Modifier.height(28.dp))

        // ── Feature Cards ───────────────────────────────────────────────────
        Text(
            text = "PROTECT YOUR DATA",
            style = MaterialTheme.typography.labelMedium.copy(
                color = TextTertiary,
                letterSpacing = 3.sp,
                fontWeight = FontWeight.SemiBold
            )
        )
        Spacer(modifier = Modifier.height(12.dp))

        FeatureCard(
            icon = Icons.Filled.FlashOn,
            title = "Quick Auto-Redact",
            subtitle = "Upload & redact PII in one step",
            accentColor = CyanAccent,
            onClick = onNavigateToProcess
        )
        Spacer(modifier = Modifier.height(12.dp))

        FeatureCard(
            icon = Icons.Filled.ManageSearch,
            title = "Scan & Review",
            subtitle = "Preview detections before redacting",
            accentColor = TealAccent,
            onClick = onNavigateToScan
        )
        Spacer(modifier = Modifier.height(12.dp))

        FeatureCard(
            icon = Icons.Filled.FolderOpen,
            title = "My Redacted Files",
            subtitle = "Manage stored redacted outputs",
            accentColor = ElectricBlue,
            onClick = onNavigateToFiles
        )
        Spacer(modifier = Modifier.height(12.dp))

        FeatureCard(
            icon = Icons.Filled.Tune,
            title = "Settings",
            subtitle = "Server configuration & preferences",
            accentColor = NeonPurple,
            onClick = onNavigateToSettings
        )

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun HealthStatusCard(state: HealthState, onRetry: () -> Unit) {
    val pulseAnim = rememberInfiniteTransition(label = "pulse")
    val pulseAlpha by pulseAnim.animateFloat(
        initialValue = 0.4f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseAlpha"
    )

    GlassCard {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Status dot
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .clip(CircleShape)
                    .background(
                        when (state) {
                            is HealthState.Checking -> StatusWarning.copy(alpha = pulseAlpha)
                            is HealthState.Online -> StatusOnline
                            is HealthState.Offline -> StatusOffline
                        }
                    )
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = when (state) {
                        is HealthState.Checking -> "Checking server…"
                        is HealthState.Online -> "Server Online"
                        is HealthState.Offline -> "Server Offline"
                    },
                    style = MaterialTheme.typography.titleSmall.copy(
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                )
                Text(
                    text = when (state) {
                        is HealthState.Checking -> "Connecting to backend API"
                        is HealthState.Online -> "All systems operational"
                        is HealthState.Offline -> state.error
                    },
                    style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary)
                )
            }
            if (state is HealthState.Offline) {
                IconButton(onClick = onRetry) {
                    Icon(Icons.Filled.Refresh, "Retry", tint = CyanAccent)
                }
            }
        }
    }
}

@Composable
private fun ShieldHero() {
    val infiniteTransition = rememberInfiniteTransition(label = "heroGlow")
    val glowProgress by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 0.8f,
        animationSpec = infiniteRepeatable(
            animation = tween(2500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glowFloat"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(160.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        CyanAccent.copy(alpha = 0.15f * glowProgress),
                        TealAccent.copy(alpha = 0.05f),
                        Color.Transparent
                    )
                )
            )
            .border(1.dp, BorderColor.copy(alpha = 0.3f), RoundedCornerShape(20.dp)),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                imageVector = Icons.Filled.Shield,
                contentDescription = null,
                tint = CyanAccent.copy(alpha = glowProgress),
                modifier = Modifier.size(56.dp)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Your PII Guardian",
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
            )
            Text(
                text = "Detect • Classify • Redact",
                style = MaterialTheme.typography.bodySmall.copy(
                    color = CyanAccent.copy(alpha = 0.7f),
                    letterSpacing = 2.sp
                )
            )
        }
    }
}

@Composable
private fun FeatureCard(
    icon: ImageVector,
    title: String,
    subtitle: String,
    accentColor: Color,
    onClick: () -> Unit
) {
    GlassCard(
        modifier = Modifier.clickable(onClick = onClick)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(accentColor.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(24.dp)
                )
            }
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall.copy(
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary)
                )
            }
            Icon(
                Icons.Filled.ChevronRight,
                contentDescription = null,
                tint = TextTertiary,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}
