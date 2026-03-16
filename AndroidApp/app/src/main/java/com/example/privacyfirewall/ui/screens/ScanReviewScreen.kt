package com.example.privacyfirewall.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import coil.compose.AsyncImagePainter
import coil.compose.rememberAsyncImagePainter
import com.example.privacyfirewall.data.models.ManualRegion
import com.example.privacyfirewall.data.models.MediaType
import com.example.privacyfirewall.data.models.SeverityLevel
import com.example.privacyfirewall.ui.components.*
import com.example.privacyfirewall.ui.theme.*
import com.example.privacyfirewall.viewmodel.ScanReviewViewModel
import com.example.privacyfirewall.viewmodel.ScanUiState

@Composable
fun ScanReviewScreen(
    viewModel: ScanReviewViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val selectedUri by viewModel.selectedUri.collectAsState()
    val selectedFileType by viewModel.selectedFileType.collectAsState()
    val approvedEntities by viewModel.approvedEntities.collectAsState()
    val manualRegions by viewModel.manualRegions.collectAsState()

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
        // ── Top Bar ─────────────────────────────────────────────────────
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Filled.ManageSearch, null, tint = TealAccent, modifier = Modifier.size(28.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                "Scan & Review",
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Bold, color = TextPrimary
                )
            )
        }

        when (val state = uiState) {
            is ScanUiState.Idle -> {
                IdleContent(selectedUri, selectedFileType, filePicker, viewModel)
            }
            is ScanUiState.Scanning -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = TealAccent, strokeWidth = 3.dp)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Scanning for PII…", color = TextSecondary)
                        Text("No data is being modified", style = MaterialTheme.typography.bodySmall, color = TextTertiary)
                    }
                }
            }
            is ScanUiState.Scanned -> {
                InteractiveEditorContent(
                    state = state,
                    selectedUri = selectedUri,
                    selectedFileType = selectedFileType,
                    approvedEntities = approvedEntities,
                    manualRegions = manualRegions,
                    viewModel = viewModel
                )
            }
            is ScanUiState.Redacting -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = RiskRed, strokeWidth = 3.dp)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Applying redaction…", color = TextSecondary)
                    }
                }
            }
            is ScanUiState.Redacted -> {
                RedactedResultContent(state, selectedUri, viewModel)
            }
            is ScanUiState.Error -> {
                ErrorStateView(message = state.message, onRetry = { viewModel.reset() })
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Idle — File selection
// ═══════════════════════════════════════════════════════════════════════
@Composable
private fun IdleContent(
    selectedUri: Uri?,
    selectedFileType: MediaType,
    filePicker: androidx.activity.result.ActivityResultLauncher<String>,
    viewModel: ScanReviewViewModel
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
    ) {
        Text("SELECT FILE TYPE", style = sectionLabel())
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ScanFileTypeChip("Image", MediaType.IMAGE, selectedFileType) { viewModel.setSelectedFileType(it) }
            ScanFileTypeChip("Document", MediaType.DOCUMENT, selectedFileType) { viewModel.setSelectedFileType(it) }
            ScanFileTypeChip("Audio", MediaType.AUDIO, selectedFileType) { viewModel.setSelectedFileType(it) }
        }

        Spacer(modifier = Modifier.height(24.dp))

        GlassCard(
            modifier = Modifier.clickable {
                val mime = when (selectedFileType) {
                    MediaType.IMAGE -> "image/*"
                    MediaType.DOCUMENT -> "*/*"
                    MediaType.AUDIO -> "audio/*"
                }
                filePicker.launch(mime)
            }
        ) {
            if (selectedUri != null && selectedFileType == MediaType.IMAGE) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    AsyncImage(
                        model = selectedUri,
                        contentDescription = "Selected Image",
                        modifier = Modifier.fillMaxWidth().heightIn(max = 200.dp).clip(RoundedCornerShape(12.dp)),
                        contentScale = ContentScale.Fit
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CheckCircle, null, tint = TealAccent, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Image selected ✓", style = MaterialTheme.typography.titleSmall.copy(color = TealAccent))
                    }
                }
            } else {
                Column(modifier = Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        if (selectedUri != null) Icons.Filled.CheckCircle else Icons.Filled.FileUpload, null,
                        tint = if (selectedUri != null) TealAccent else TextTertiary, modifier = Modifier.size(48.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        if (selectedUri != null) "File selected ✓" else "Select a file to scan",
                        style = MaterialTheme.typography.titleSmall.copy(color = if (selectedUri != null) TealAccent else TextSecondary)
                    )
                    Text("File will be scanned without modification", style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary))
                }
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        GlassCard {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("How it works", style = MaterialTheme.typography.titleSmall.copy(color = TextPrimary, fontWeight = FontWeight.SemiBold))
                Spacer(modifier = Modifier.height(8.dp))
                WorkflowStep("1", "Scan file for PII entities")
                WorkflowStep("2", "Review & edit detected regions on image")
                WorkflowStep("3", "Draw new manual redaction areas")
                WorkflowStep("4", "Apply redaction to approved items")
            }
        }

        Spacer(modifier = Modifier.height(28.dp))

        Button(
            onClick = { viewModel.scanFile() },
            modifier = Modifier.fillMaxWidth().height(56.dp),
            enabled = selectedUri != null,
            colors = ButtonDefaults.buttonColors(
                containerColor = TealAccent, contentColor = DeepNavy,
                disabledContainerColor = ElevatedSurface, disabledContentColor = TextTertiary
            ),
            shape = RoundedCornerShape(16.dp)
        ) {
            Icon(Icons.Filled.Search, null, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Scan File", fontWeight = FontWeight.Bold)
        }
        Spacer(modifier = Modifier.height(32.dp))
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Scanned — Interactive Editor (like the web screenshot)
// ═══════════════════════════════════════════════════════════════════════
@Composable
private fun InteractiveEditorContent(
    state: ScanUiState.Scanned,
    selectedUri: Uri?,
    selectedFileType: MediaType,
    approvedEntities: Map<String, Boolean>,
    manualRegions: List<ManualRegion>,
    viewModel: ScanReviewViewModel
) {
    val response = state.response
    var isDrawMode by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp)
    ) {
        // ── Header ──────────────────────────────────────────────────
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.EditNote, null, tint = TealAccent, modifier = Modifier.size(24.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Review & Redact", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold, color = TextPrimary))
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "Click existing boxes to toggle them off/on. Click and drag on the image to draw new redaction regions.",
                style = MaterialTheme.typography.bodySmall.copy(color = TextSecondary)
            )
            Spacer(modifier = Modifier.height(12.dp))
        }

        // ── Interactive Image Canvas ────────────────────────────────
        if (selectedFileType == MediaType.IMAGE && selectedUri != null) {
            item {
                // Draw mode toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = { isDrawMode = false },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = if (!isDrawMode) TealAccent else TextTertiary
                        ),
                        border = BorderStroke(1.dp, if (!isDrawMode) TealAccent else BorderColor)
                    ) {
                        Icon(Icons.Filled.TouchApp, null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Tap Mode", fontSize = 12.sp)
                    }
                    OutlinedButton(
                        onClick = { isDrawMode = true },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = if (isDrawMode) CyanAccent else TextTertiary
                        ),
                        border = BorderStroke(1.dp, if (isDrawMode) CyanAccent else BorderColor)
                    ) {
                        Icon(Icons.Filled.Draw, null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Draw Mode", fontSize = 12.sp)
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))

                ImageEditorCanvas(
                    imageUri = selectedUri,
                    flaggedEntities = response.flaggedEntities,
                    approvedEntities = approvedEntities,
                    manualRegions = manualRegions,
                    isDrawMode = isDrawMode,
                    onToggleEntity = { viewModel.toggleEntity(it) },
                    onAddManualRegion = { region -> viewModel.addManualRegion(region) }
                )
                Spacer(modifier = Modifier.height(16.dp))
            }
        }

        // ── Risk Score ──────────────────────────────────────────────
        item {
            Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                RiskScoreGauge(score = response.riskScore, modifier = Modifier.size(140.dp))
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        // ── Scan ID ─────────────────────────────────────────────────
        item {
            GlassCard {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Tag, null, tint = CyanAccent, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Scan ID: ", style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary))
                    Text(response.scanId, style = MaterialTheme.typography.bodySmall.copy(color = CyanAccent, fontFamily = FontFamily.Monospace))
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        // ── Approve/Reject All ──────────────────────────────────────
        item {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { viewModel.approveAll() }, modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = TealAccent),
                    border = BorderStroke(1.dp, TealAccent.copy(alpha = 0.5f))
                ) { Text("Approve All", fontSize = 12.sp) }
                OutlinedButton(
                    onClick = { viewModel.rejectAll() }, modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = RiskRed),
                    border = BorderStroke(1.dp, RiskRed.copy(alpha = 0.5f))
                ) { Text("Reject All", fontSize = 12.sp) }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text("DETECTED ENTITIES (${response.flaggedEntities.size})", style = sectionLabel())
            Spacer(modifier = Modifier.height(8.dp))
        }

        // ── Entity Cards with Checkboxes ────────────────────────────
        itemsIndexed(response.flaggedEntities) { _, entity ->
            val entityId = entity.detected.entityId
            val isApproved = approvedEntities[entityId] ?: true
            EntityCard(
                entity = entity,
                trailingContent = {
                    Checkbox(
                        checked = isApproved,
                        onCheckedChange = { viewModel.toggleEntity(entityId) },
                        colors = CheckboxDefaults.colors(
                            checkedColor = TealAccent, uncheckedColor = TextTertiary, checkmarkColor = DeepNavy
                        )
                    )
                }
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        // ── Manual Regions List ─────────────────────────────────────
        if (manualRegions.isNotEmpty()) {
            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text("MANUAL REGIONS (${manualRegions.size})", style = sectionLabel())
                Spacer(modifier = Modifier.height(8.dp))
            }
            itemsIndexed(manualRegions) { index, region ->
                GlassCard {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Filled.CropFree, null, tint = CyanAccent, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                if (region.label.isNotBlank()) region.label else "Manual Region ${index + 1}",
                                style = MaterialTheme.typography.titleSmall.copy(color = TextPrimary)
                            )
                            Text(
                                "x1:${region.bbox[0].toInt()} y1:${region.bbox[1].toInt()} x2:${region.bbox[2].toInt()} y2:${region.bbox[3].toInt()}",
                                style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary, fontFamily = FontFamily.Monospace)
                            )
                        }
                        IconButton(onClick = { viewModel.removeManualRegion(index) }) {
                            Icon(Icons.Filled.Close, "Remove", tint = RiskRed, modifier = Modifier.size(18.dp))
                        }
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
            }
        }

        // ── Redact Button ───────────────────────────────────────────
        item {
            Spacer(modifier = Modifier.height(16.dp))
            val approvedCount = approvedEntities.count { it.value }
            val totalRegions = approvedCount + manualRegions.size
            Button(
                onClick = { viewModel.redactApproved() },
                modifier = Modifier.fillMaxWidth().height(56.dp),
                enabled = totalRegions > 0,
                colors = ButtonDefaults.buttonColors(
                    containerColor = RiskRed, contentColor = TextPrimary,
                    disabledContainerColor = ElevatedSurface, disabledContentColor = TextTertiary
                ),
                shape = RoundedCornerShape(16.dp)
            ) {
                Icon(Icons.Filled.ContentCut, null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Redact $totalRegions regions", fontWeight = FontWeight.Bold)
            }
            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Image Canvas with draw-to-select + tappable bounding boxes
// ═══════════════════════════════════════════════════════════════════════
@Composable
private fun ImageEditorCanvas(
    imageUri: Uri,
    flaggedEntities: List<com.example.privacyfirewall.data.models.FlaggedEntity>,
    approvedEntities: Map<String, Boolean>,
    manualRegions: List<ManualRegion>,
    isDrawMode: Boolean,
    onToggleEntity: (String) -> Unit,
    onAddManualRegion: (ManualRegion) -> Unit
) {
    val painter = rememberAsyncImagePainter(model = imageUri)
    var drawStart by remember { mutableStateOf<Offset?>(null) }
    var drawCurrent by remember { mutableStateOf<Offset?>(null) }

    GlassCard {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp))
                .background(Color.Black.copy(alpha = 0.3f))
        ) {
            // Draw the image
            Image(
                painter = painter,
                contentDescription = "Document Image",
                modifier = Modifier.fillMaxWidth(),
                contentScale = ContentScale.FillWidth
            )

            val imageState = painter.state
            if (imageState is AsyncImagePainter.State.Success) {
                val intrinsicSize = imageState.painter.intrinsicSize
                if (intrinsicSize.width > 0 && intrinsicSize.height > 0) {
                    val scale = constraints.maxWidth.toFloat() / intrinsicSize.width
                    val imgHeightPx = intrinsicSize.height * scale
                    val density = LocalDensity.current

                    // Detected entity bounding boxes (tappable)
                    flaggedEntities.forEach { entity ->
                        val bbox = entity.detected.locationReference?.bbox
                        if (bbox != null && bbox.size == 4) {
                            val entityId = entity.detected.entityId
                            val isApproved = approvedEntities[entityId] ?: true
                            val boxColor = if (isApproved) RiskRed else TextSecondary
                            val bgColor = if (isApproved) RiskRed.copy(alpha = 0.3f) else TextSecondary.copy(alpha = 0.15f)
                            val icon = if (isApproved) "✓" else "✕"

                            val leftDp = with(density) { (bbox[0] * scale).toDp() }
                            val topDp = with(density) { (bbox[1] * scale).toDp() }
                            val widthDp = with(density) { ((bbox[2] - bbox[0]) * scale).toDp() }
                            val heightDp = with(density) { ((bbox[3] - bbox[1]) * scale).toDp() }

                            Box(
                                modifier = Modifier
                                    .offset(x = leftDp, y = topDp)
                                    .size(width = widthDp, height = heightDp)
                                    .background(bgColor)
                                    .border(1.5.dp, boxColor)
                                    .clickable { onToggleEntity(entityId) }
                            ) {
                                Text(
                                    text = "${entity.detected.type} $icon",
                                    color = Color.White,
                                    fontSize = 8.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.background(boxColor).padding(horizontal = 3.dp, vertical = 1.dp)
                                )
                            }
                        }
                    }

                    // Manual region boxes (already added)
                    manualRegions.forEachIndexed { index, region ->
                        if (region.bbox.size == 4) {
                            val leftDp = with(density) { (region.bbox[0] * scale).toDp() }
                            val topDp = with(density) { (region.bbox[1] * scale).toDp() }
                            val widthDp = with(density) { ((region.bbox[2] - region.bbox[0]) * scale).toDp() }
                            val heightDp = with(density) { ((region.bbox[3] - region.bbox[1]) * scale).toDp() }

                            Box(
                                modifier = Modifier
                                    .offset(x = leftDp, y = topDp)
                                    .size(width = widthDp, height = heightDp)
                                    .background(CyanAccent.copy(alpha = 0.25f))
                                    .border(1.5.dp, CyanAccent)
                            ) {
                                Text(
                                    text = "Manual ${index + 1}",
                                    color = Color.White,
                                    fontSize = 8.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.background(CyanAccent.copy(alpha = 0.8f)).padding(horizontal = 3.dp, vertical = 1.dp)
                                )
                            }
                        }
                    }

                    // Draw mode: active drag rectangle
                    if (isDrawMode) {
                        val dragStart = drawStart
                        val dragCurrent = drawCurrent
                        if (dragStart != null && dragCurrent != null) {
                            val rectLeft = minOf(dragStart.x, dragCurrent.x)
                            val rectTop = minOf(dragStart.y, dragCurrent.y)
                            val rectRight = maxOf(dragStart.x, dragCurrent.x)
                            val rectBottom = maxOf(dragStart.y, dragCurrent.y)

                            Canvas(
                                modifier = Modifier.matchParentSize()
                            ) {
                                drawRect(
                                    color = CyanAccent.copy(alpha = 0.3f),
                                    topLeft = Offset(rectLeft, rectTop),
                                    size = androidx.compose.ui.geometry.Size(rectRight - rectLeft, rectBottom - rectTop)
                                )
                                drawRect(
                                    color = CyanAccent,
                                    topLeft = Offset(rectLeft, rectTop),
                                    size = androidx.compose.ui.geometry.Size(rectRight - rectLeft, rectBottom - rectTop),
                                    style = Stroke(width = 3f)
                                )
                            }
                        }

                        // Invisible overlay to capture drag
                        Box(
                            modifier = Modifier
                                .matchParentSize()
                                .pointerInput(Unit) {
                                    detectDragGestures(
                                        onDragStart = { offset ->
                                            drawStart = offset
                                            drawCurrent = offset
                                        },
                                        onDrag = { change, _ ->
                                            change.consume()
                                            drawCurrent = change.position
                                        },
                                        onDragEnd = {
                                            val s = drawStart
                                            val c = drawCurrent
                                            if (s != null && c != null) {
                                                val x1 = minOf(s.x, c.x) / scale
                                                val y1 = minOf(s.y, c.y) / scale
                                                val x2 = maxOf(s.x, c.x) / scale
                                                val y2 = maxOf(s.y, c.y) / scale
                                                if ((x2 - x1) > 5 && (y2 - y1) > 5) {
                                                    onAddManualRegion(ManualRegion(bbox = listOf(x1, y1, x2, y2), label = "Manual"))
                                                }
                                            }
                                            drawStart = null
                                            drawCurrent = null
                                        },
                                        onDragCancel = {
                                            drawStart = null
                                            drawCurrent = null
                                        }
                                    )
                                }
                        )
                    }
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Redacted — Before/After Preview + Download
// ═══════════════════════════════════════════════════════════════════════
@Composable
private fun RedactedResultContent(
    state: ScanUiState.Redacted,
    selectedUri: Uri?,
    viewModel: ScanReviewViewModel
) {
    val response = state.response
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(32.dp))
        Icon(Icons.Filled.CheckCircle, null, tint = TealAccent, modifier = Modifier.size(72.dp))
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            "Redaction Complete",
            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold, color = TextPrimary)
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            response.filename ?: "File redacted successfully",
            style = MaterialTheme.typography.bodyMedium.copy(color = TextSecondary)
        )
        Spacer(modifier = Modifier.height(24.dp))

        if (response.downloadUrl != null) {
            val url = response.downloadUrl
            val isImage = url.contains(".jpg", true) || url.contains(".jpeg", true) ||
                    url.contains(".png", true) || url.contains(".webp", true)

            if (isImage) {
                Text("BEFORE & AFTER", style = sectionLabel())
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (selectedUri != null) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Original", style = MaterialTheme.typography.labelSmall.copy(color = TextSecondary), modifier = Modifier.padding(bottom = 4.dp))
                            AsyncImage(
                                model = selectedUri, contentDescription = "Original",
                                modifier = Modifier.fillMaxWidth().heightIn(max = 220.dp).clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.3f)),
                                contentScale = ContentScale.Fit
                            )
                        }
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Redacted", style = MaterialTheme.typography.labelSmall.copy(color = TealAccent), modifier = Modifier.padding(bottom = 4.dp))
                        AsyncImage(
                            model = url, contentDescription = "Redacted",
                            modifier = Modifier.fillMaxWidth().heightIn(max = 220.dp).clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.3f)),
                            contentScale = ContentScale.Fit
                        )
                    }
                }
                Spacer(modifier = Modifier.height(24.dp))
            }

            GlassCard(
                modifier = Modifier.clickable {
                    try {
                        val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, Uri.parse(url))
                        context.startActivity(intent)
                    } catch (_: Exception) {}
                }
            ) {
                Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.OpenInBrowser, null, tint = TealAccent, modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Open & Download", style = MaterialTheme.typography.titleSmall.copy(color = TextPrimary, fontWeight = FontWeight.SemiBold))
                        Text("Tap to open in browser", style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary))
                    }
                }
            }
        } else if (response.localPath != null) {
            GlassCard {
                Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Folder, null, tint = ElectricBlue, modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Saved locally", style = MaterialTheme.typography.titleSmall.copy(color = TextPrimary, fontWeight = FontWeight.SemiBold))
                        Text(response.localPath, style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary))
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(28.dp))
        OutlinedButton(
            onClick = { viewModel.reset() },
            modifier = Modifier.fillMaxWidth().height(48.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = TealAccent),
            border = BorderStroke(1.dp, TealAccent.copy(alpha = 0.5f)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Icon(Icons.Filled.Refresh, null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Scan Another File")
        }
        Spacer(modifier = Modifier.height(32.dp))
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Small reusable composables
// ═══════════════════════════════════════════════════════════════════════
@Composable
private fun WorkflowStep(number: String, text: String) {
    Row(modifier = Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier.size(24.dp).clip(RoundedCornerShape(6.dp)).background(TealAccent.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center
        ) {
            Text(number, style = MaterialTheme.typography.labelSmall.copy(color = TealAccent, fontWeight = FontWeight.Bold))
        }
        Spacer(modifier = Modifier.width(10.dp))
        Text(text, style = MaterialTheme.typography.bodySmall.copy(color = TextSecondary))
    }
}

@Composable
private fun ScanFileTypeChip(label: String, type: MediaType, selected: MediaType, onSelect: (MediaType) -> Unit) {
    val isSelected = type == selected
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (isSelected) TealAccent.copy(alpha = 0.15f) else CardSurface)
            .border(1.dp, if (isSelected) TealAccent else BorderColor, RoundedCornerShape(12.dp))
            .clickable { onSelect(type) }
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium.copy(
                color = if (isSelected) TealAccent else TextSecondary,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
            )
        )
    }
}

@Composable
private fun sectionLabel() = MaterialTheme.typography.labelMedium.copy(
    color = TextTertiary, letterSpacing = 2.sp, fontWeight = FontWeight.SemiBold
)
