package com.example.privacyfirewall.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import androidx.compose.ui.platform.LocalContext
import android.content.Intent
import com.example.privacyfirewall.data.models.*
import com.example.privacyfirewall.ui.components.*
import com.example.privacyfirewall.ui.theme.*
import com.example.privacyfirewall.viewmodel.ProcessUiState
import com.example.privacyfirewall.viewmodel.ProcessViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickProcessScreen(
    viewModel: ProcessViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val selectedUri by viewModel.selectedUri.collectAsState()
    val selectedMode by viewModel.selectedMode.collectAsState()
    val applyRedaction by viewModel.applyRedaction.collectAsState()
    val scoreThreshold by viewModel.scoreThreshold.collectAsState()
    val policyJson by viewModel.policyJson.collectAsState()
    val selectedFileType by viewModel.selectedFileType.collectAsState()

    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { viewModel.setSelectedUri(it) }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DeepNavy)
    ) {
        // ── Top Bar ─────────────────────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Filled.FlashOn, null, tint = CyanAccent, modifier = Modifier.size(28.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                "Quick Process",
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Bold, color = TextPrimary
                )
            )
        }

        when (val state = uiState) {
            is ProcessUiState.Idle -> {
                // Configuration UI
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = 20.dp)
                ) {
                    // ── File Type Selector ──────────────────────────────────
                    Text("FILE TYPE", style = sectionHeader())
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FileTypeChip("Image", MediaType.IMAGE, selectedFileType) {
                            viewModel.setSelectedFileType(it)
                        }
                        FileTypeChip("Document", MediaType.DOCUMENT, selectedFileType) {
                            viewModel.setSelectedFileType(it)
                        }
                        FileTypeChip("Audio", MediaType.AUDIO, selectedFileType) {
                            viewModel.setSelectedFileType(it)
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // ── File Picker ──────────────────────────────────────────
                    GlassCard(
                        modifier = Modifier.clickable {
                            val mimeType = when (selectedFileType) {
                                MediaType.IMAGE -> "image/*"
                                MediaType.DOCUMENT -> "*/*"
                                MediaType.AUDIO -> "audio/*"
                            }
                            filePicker.launch(mimeType)
                        }
                    ) {
                        if (selectedUri != null && selectedFileType == MediaType.IMAGE) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                                AsyncImage(
                                    model = selectedUri,
                                    contentDescription = "Selected Image",
                                    modifier = Modifier.fillMaxWidth().heightIn(max = 200.dp).clip(RoundedCornerShape(12.dp)),
                                    contentScale = androidx.compose.ui.layout.ContentScale.Fit
                                )
                                Spacer(modifier = Modifier.height(12.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Filled.CheckCircle, null, tint = TealAccent, modifier = Modifier.size(20.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Image selected ✓", style = MaterialTheme.typography.titleSmall.copy(color = TealAccent))
                                }
                            }
                        } else {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(20.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    if (selectedUri != null) Icons.Filled.CheckCircle else Icons.Filled.CloudUpload,
                                    null,
                                    tint = if (selectedUri != null) TealAccent else CyanAccent,
                                    modifier = Modifier.size(32.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Text(
                                    if (selectedUri != null) "File selected ✓" else "Tap to select file",
                                    style = MaterialTheme.typography.titleSmall.copy(
                                        color = if (selectedUri != null) TealAccent else TextSecondary
                                    )
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // ── Processing Mode ─────────────────────────────────────
                    Text("PROCESSING MODE", style = sectionHeader())
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        ProcessingMode.values().forEach { mode ->
                            ModeChip(mode, selectedMode) { viewModel.setMode(it) }
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // ── Options ──────────────────────────────────────────────
                    GlassCard {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text("Apply Redaction", style = MaterialTheme.typography.titleSmall.copy(color = TextPrimary))
                                    Text("Force redaction on results", style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary))
                                }
                                Switch(
                                    checked = applyRedaction,
                                    onCheckedChange = { viewModel.setApplyRedaction(it) },
                                    colors = SwitchDefaults.colors(
                                        checkedThumbColor = CyanAccent,
                                        checkedTrackColor = CyanAccent.copy(alpha = 0.3f)
                                    )
                                )
                            }

                            if (selectedMode == ProcessingMode.AUTO_REDACT) {
                                HorizontalDivider(color = DividerColor, modifier = Modifier.padding(vertical = 12.dp))
                                Text("Risk Threshold", style = MaterialTheme.typography.titleSmall.copy(color = TextPrimary))
                                Spacer(modifier = Modifier.height(4.dp))
                                val t = scoreThreshold ?: 0.5f
                                Slider(
                                    value = t,
                                    onValueChange = { viewModel.setScoreThreshold(it) },
                                    valueRange = 0f..1f,
                                    colors = SliderDefaults.colors(
                                        thumbColor = CyanAccent,
                                        activeTrackColor = CyanAccent
                                    )
                                )
                                Text(
                                    "Threshold: ${String.format("%.2f", t)}",
                                    style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary)
                                )
                            }

                            if (selectedMode == ProcessingMode.POLICY) {
                                HorizontalDivider(color = DividerColor, modifier = Modifier.padding(vertical = 12.dp))
                                Text("Policy JSON", style = MaterialTheme.typography.titleSmall.copy(color = TextPrimary))
                                Spacer(modifier = Modifier.height(8.dp))
                                OutlinedTextField(
                                    value = policyJson ?: "",
                                    onValueChange = { viewModel.setPolicyJson(it.ifBlank { null }) },
                                    placeholder = { Text("{\"always_redact\": [\"aadhaar\", \"pan\"]}", style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary)) },
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = CyanAccent,
                                        unfocusedBorderColor = BorderColor,
                                        cursorColor = CyanAccent,
                                        focusedTextColor = TextPrimary,
                                        unfocusedTextColor = TextPrimary
                                    ),
                                    textStyle = MaterialTheme.typography.bodySmall,
                                    maxLines = 3
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(28.dp))

                    // ── Process Button ───────────────────────────────────────
                    Button(
                        onClick = { viewModel.processFile() },
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        enabled = selectedUri != null,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = CyanAccent,
                            contentColor = DeepNavy,
                            disabledContainerColor = ElevatedSurface,
                            disabledContentColor = TextTertiary
                        ),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Icon(Icons.Filled.Security, null, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Process File", fontWeight = FontWeight.Bold)
                    }

                    Spacer(modifier = Modifier.height(32.dp))
                }
            }

            is ProcessUiState.Processing -> {
                // Shimmer loading
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = CyanAccent, strokeWidth = 3.dp)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Analyzing for PII…", color = TextSecondary)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("This may take a moment", style = MaterialTheme.typography.bodySmall, color = TextTertiary)
                    }
                }
            }

            is ProcessUiState.Success -> {
                ProcessResultContent(state.response, selectedUri) { viewModel.reset() }
            }

            is ProcessUiState.Error -> {
                ErrorStateView(message = state.message, onRetry = { viewModel.reset() })
            }
        }
    }
}

@Composable
private fun ProcessResultContent(response: ProcessingResponse, selectedUri: Uri?, onReset: () -> Unit) {
    val context = LocalContext.current
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
    ) {
        // ── Risk Gauge ──────────────────────────────────────────────────
        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            RiskScoreGauge(score = response.riskScore)
        }
        Spacer(modifier = Modifier.height(8.dp))

        // ── Warning ─────────────────────────────────────────────────────
        response.warningMessage?.let { msg ->
            GlassCard {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Warning, null, tint = RiskAmber, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(msg, style = MaterialTheme.typography.bodySmall.copy(color = RiskAmber))
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // ── Flagged Entities ────────────────────────────────────────────
        if (response.flaggedEntities.isNotEmpty()) {
            Text("DETECTED ENTITIES (${response.flaggedEntities.size})", style = sectionHeader())
            Spacer(modifier = Modifier.height(8.dp))
            response.flaggedEntities.forEach { entity ->
                EntityCard(entity = entity)
                Spacer(modifier = Modifier.height(8.dp))
            }
        }

        // ── Reasoning Trace ─────────────────────────────────────────────
        if (response.reasoningTrace.isNotEmpty()) {
            Spacer(modifier = Modifier.height(16.dp))
            Text("REASONING", style = sectionHeader())
            Spacer(modifier = Modifier.height(8.dp))
            GlassCard {
                Column(modifier = Modifier.padding(12.dp)) {
                    response.reasoningTrace.forEach { trace ->
                        Row(modifier = Modifier.padding(vertical = 4.dp)) {
                            Text("•", color = CyanAccent)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(trace, style = MaterialTheme.typography.bodySmall.copy(color = TextSecondary))
                        }
                    }
                }
            }
        }

        // ── Audit Log ───────────────────────────────────────────────────
        if (response.auditLog.isNotEmpty()) {
            Spacer(modifier = Modifier.height(16.dp))
            Text("AUDIT LOG", style = sectionHeader())
            Spacer(modifier = Modifier.height(8.dp))
            GlassCard {
                Column(modifier = Modifier.padding(12.dp)) {
                    response.auditLog.forEachIndexed { index, event ->
                        Row(
                            modifier = Modifier.padding(vertical = 6.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(24.dp)
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(CyanAccent.copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    "${index + 1}",
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        color = CyanAccent, fontWeight = FontWeight.Bold
                                    )
                                )
                            }
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text(
                                    event.stage.replace("_", " ").uppercase(),
                                    style = MaterialTheme.typography.labelSmall.copy(
                                        color = TextPrimary, fontWeight = FontWeight.SemiBold
                                    )
                                )
                                val detailStr = event.details.entries.joinToString(", ") { "${it.key}: ${it.value}" }
                                if (detailStr.isNotBlank()) {
                                    Text(detailStr, style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary))
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── Download ────────────────────────────────────────────────────
        if (response.downloadUrl != null || response.outputFilePath != null) {
            Spacer(modifier = Modifier.height(20.dp))
            val url = response.downloadUrl
            if (url != null && (url.contains(".jpg", true) || url.contains(".jpeg", true) || url.contains(".png", true) || url.contains(".webp", true))) {
                Text("BEFORE & AFTER PREVIEW", style = sectionHeader())
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (selectedUri != null) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Original", style = MaterialTheme.typography.labelSmall.copy(color = TextSecondary), modifier = Modifier.padding(bottom = 4.dp))
                            AsyncImage(
                                model = selectedUri,
                                contentDescription = "Original Image",
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = 200.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.3f)),
                                contentScale = androidx.compose.ui.layout.ContentScale.Fit
                            )
                        }
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Redacted", style = MaterialTheme.typography.labelSmall.copy(color = TealAccent), modifier = Modifier.padding(bottom = 4.dp))
                        AsyncImage(
                            model = url,
                            contentDescription = "Redacted Image",
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 200.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(androidx.compose.ui.graphics.Color.Black.copy(alpha = 0.3f)),
                            contentScale = androidx.compose.ui.layout.ContentScale.Fit
                        )
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
            }

            GlassCard(
                modifier = Modifier.clickable {
                    if (url != null) {
                        try {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                            context.startActivity(intent)
                        } catch (e: Exception) {
                            // Ignore
                        }
                    }
                }
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(if (url != null) Icons.Filled.OpenInBrowser else Icons.Filled.Download, null, tint = TealAccent, modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(if (url != null) "Open & Download" else "Redacted File Ready", style = MaterialTheme.typography.titleSmall.copy(color = TextPrimary, fontWeight = FontWeight.SemiBold))
                        Text(
                            url ?: response.outputFilePath ?: "",
                            style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary),
                            maxLines = 1,
                            overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        // ── New Scan Button ─────────────────────────────────────────────
        OutlinedButton(
            onClick = onReset,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = CyanAccent),
            border = BorderStroke(1.dp, CyanAccent.copy(alpha = 0.5f)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Icon(Icons.Filled.Refresh, null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Process Another File")
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun FileTypeChip(label: String, type: MediaType, selected: MediaType, onSelect: (MediaType) -> Unit) {
    val isSelected = type == selected
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (isSelected) CyanAccent.copy(alpha = 0.15f) else CardSurface)
            .border(1.dp, if (isSelected) CyanAccent else BorderColor, RoundedCornerShape(12.dp))
            .clickable { onSelect(type) }
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium.copy(
                color = if (isSelected) CyanAccent else TextSecondary,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
            )
        )
    }
}

@Composable
private fun RowScope.ModeChip(mode: ProcessingMode, selected: ProcessingMode, onSelect: (ProcessingMode) -> Unit) {
    val isSelected = mode == selected
    val label = when(mode) {
        ProcessingMode.FLAG -> "Flag"
        ProcessingMode.WARN -> "Warn"
        ProcessingMode.AUTO_REDACT -> "Auto"
        ProcessingMode.POLICY -> "Policy"
    }
    Box(
        modifier = Modifier
            .weight(1f)
            .clip(RoundedCornerShape(12.dp))
            .background(if (isSelected) CyanAccent.copy(alpha = 0.15f) else CardSurface)
            .border(1.dp, if (isSelected) CyanAccent else BorderColor, RoundedCornerShape(12.dp))
            .clickable { onSelect(mode) }
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium.copy(
                color = if (isSelected) CyanAccent else TextSecondary,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
            )
        )
    }
}

@Composable
private fun sectionHeader() = MaterialTheme.typography.labelMedium.copy(
    color = TextTertiary,
    letterSpacing = 2.sp,
    fontWeight = FontWeight.SemiBold
)
