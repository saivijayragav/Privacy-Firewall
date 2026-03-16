package com.example.privacyfirewall.ui.screens

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.privacyfirewall.data.models.R2Object
import com.example.privacyfirewall.ui.components.*
import com.example.privacyfirewall.ui.theme.*
import com.example.privacyfirewall.viewmodel.FileManagerViewModel
import com.example.privacyfirewall.viewmodel.FilesUiState

@Composable
fun FileManagerScreen(
    viewModel: FileManagerViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val downloadUrl by viewModel.downloadUrl.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current

    LaunchedEffect(downloadUrl) {
        downloadUrl?.let { url ->
            try {
                val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
                context.startActivity(intent)
            } catch (e: Exception) {}
            viewModel.clearDownloadUrl()
        }
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
            Icon(Icons.Filled.FolderOpen, null, tint = ElectricBlue, modifier = Modifier.size(28.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                "Redacted Files",
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Bold, color = TextPrimary
                ),
                modifier = Modifier.weight(1f)
            )
            IconButton(onClick = { viewModel.loadFiles() }) {
                Icon(Icons.Filled.Refresh, "Refresh", tint = CyanAccent)
            }
        }

        when (val state = uiState) {
            is FilesUiState.Loading -> {
                ShimmerLoading(itemCount = 5)
            }

            is FilesUiState.Error -> {
                if (state.isR2NotConfigured) {
                    // R2 not configured banner
                    Column(
                        modifier = Modifier.fillMaxSize().padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        GlassCard {
                            Column(
                                modifier = Modifier.padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(Icons.Filled.CloudOff, null, tint = StatusWarning, modifier = Modifier.size(48.dp))
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    "Local-Only Mode",
                                    style = MaterialTheme.typography.titleMedium.copy(
                                        fontWeight = FontWeight.Bold, color = TextPrimary
                                    )
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    "Cloudflare R2 storage is not configured. Redacted files are saved locally on the server and cleaned up after 1 hour.",
                                    style = MaterialTheme.typography.bodySmall.copy(color = TextSecondary),
                                    modifier = Modifier.padding(horizontal = 8.dp),
                                    lineHeight = 18.sp
                                )
                                Spacer(modifier = Modifier.height(16.dp))
                                Text(
                                    "Configure R2 in your .env file to enable cloud storage.",
                                    style = MaterialTheme.typography.bodySmall.copy(
                                        color = CyanAccent, fontWeight = FontWeight.Medium
                                    )
                                )
                            }
                        }
                    }
                } else {
                    ErrorStateView(message = state.message, onRetry = { viewModel.loadFiles() })
                }
            }

            is FilesUiState.Success -> {
                if (state.files.isEmpty()) {
                    EmptyStateView(
                        title = "No files yet",
                        subtitle = "Redacted files will appear here after processing",
                        icon = Icons.Filled.FolderOpen
                    )
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        item {
                            Text(
                                "${state.files.size} FILES",
                                style = MaterialTheme.typography.labelMedium.copy(
                                    color = TextTertiary, letterSpacing = 2.sp, fontWeight = FontWeight.SemiBold
                                )
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                        }
                        items(state.files) { file ->
                            FileItemCard(
                                file = file,
                                onDownload = { viewModel.refreshDownloadUrl(file.key) },
                                onDelete = { viewModel.deleteFile(file.key) }
                            )
                        }
                        item { Spacer(modifier = Modifier.height(16.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun FileItemCard(
    file: R2Object,
    onDownload: () -> Unit,
    onDelete: () -> Unit
) {
    var showDeleteConfirm by remember { mutableStateOf(false) }
    val fileName = file.key.substringAfterLast("/")
    val ext = fileName.substringAfterLast(".", "")
    val sizeKb = file.size / 1024

    GlassCard {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // File type icon
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(ElectricBlue.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = when (ext.lowercase()) {
                        "pdf" -> Icons.Filled.PictureAsPdf
                        "jpg", "jpeg", "png", "webp" -> Icons.Filled.Image
                        "wav", "mp3" -> Icons.Filled.AudioFile
                        else -> Icons.Filled.InsertDriveFile
                    },
                    contentDescription = null,
                    tint = ElectricBlue,
                    modifier = Modifier.size(22.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = fileName,
                    style = MaterialTheme.typography.titleSmall.copy(
                        fontWeight = FontWeight.Medium, color = TextPrimary
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(modifier = Modifier.height(2.dp))
                Row {
                    Text(
                        "${sizeKb} KB",
                        style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary)
                    )
                    if (file.lastModified.isNotBlank()) {
                        Text(" • ", style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary))
                        Text(
                            file.lastModified.take(10),
                            style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary)
                        )
                    }
                }
            }

            IconButton(onClick = onDownload) {
                Icon(Icons.Filled.Download, "Download URL", tint = CyanAccent, modifier = Modifier.size(20.dp))
            }
            IconButton(onClick = { showDeleteConfirm = true }) {
                Icon(Icons.Filled.DeleteOutline, "Delete", tint = RiskRed.copy(alpha = 0.7f), modifier = Modifier.size(20.dp))
            }
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            confirmButton = {
                TextButton(onClick = { showDeleteConfirm = false; onDelete() }) {
                    Text("Delete", color = RiskRed)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) {
                    Text("Cancel", color = TextSecondary)
                }
            },
            title = { Text("Delete file?", color = TextPrimary) },
            text = { Text("This will permanently remove \"$fileName\" from storage.", color = TextSecondary) },
            containerColor = CardSurface,
            shape = RoundedCornerShape(16.dp)
        )
    }
}
