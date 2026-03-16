package com.example.privacyfirewall.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.privacyfirewall.ui.theme.*
import com.example.privacyfirewall.viewmodel.ChatViewModel
import com.example.privacyfirewall.viewmodel.UiChatMessage
import kotlinx.coroutines.launch

@Composable
fun ChatScreen(viewModel: ChatViewModel = viewModel()) {
    val messages by viewModel.messages.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val pendingFileName by viewModel.pendingFileName.collectAsState()
    val sessionFileName by viewModel.sessionFileName.collectAsState()
    val hasActiveSession by viewModel.hasActiveSession.collectAsState()
    val pendingFile by viewModel.pendingFile.collectAsState()
    var inputText by remember { mutableStateOf("") }

    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()
    val context = LocalContext.current

    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let {
            val cursor = context.contentResolver.query(it, null, null, null, null)
            val nameIndex = cursor?.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            cursor?.moveToFirst()
            val name = if (nameIndex != null && nameIndex >= 0) cursor?.getString(nameIndex) else null
            cursor?.close()
            viewModel.attachFile(it, name)
        }
    }

    // Auto-scroll to bottom when new messages arrive
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DeepNavy)
    ) {
        // ── Header ───────────────────────────────────────────────────────────
        ChatHeader(
            hasActiveSession = hasActiveSession,
            onNewSession = { viewModel.startNewSession() }
        )

        // ── Session File Banner ──────────────────────────────────────────────
        AnimatedVisibility(visible = hasActiveSession && sessionFileName != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(TealAccent.copy(alpha = 0.08f))
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    Icons.Filled.Description,
                    contentDescription = null,
                    tint = TealAccent,
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Session: ${sessionFileName ?: ""}",
                    color = TealAccent,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                    maxLines = 1
                )
                Text(
                    text = "File context active",
                    color = TealAccent.copy(alpha = 0.6f),
                    fontSize = 10.sp
                )
            }
        }

        // ── Messages ─────────────────────────────────────────────────────────
        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 12.dp)
        ) {
            if (messages.isEmpty() && !isLoading) {
                item { EmptyChat() }
            }
            items(messages, key = { it.id }) { msg ->
                ChatBubble(msg)
            }
            if (isLoading) {
                item { TypingIndicator() }
            }
        }

        // ── Attachment pill ──────────────────────────────────────────────────
        AnimatedVisibility(visible = pendingFileName != null) {
            pendingFileName?.let { name ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(ElevatedSurface)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Filled.InsertDriveFile,
                        contentDescription = null,
                        tint = CyanAccent,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = name,
                        color = TextPrimary,
                        fontSize = 13.sp,
                        modifier = Modifier.weight(1f),
                        maxLines = 1
                    )
                    IconButton(
                        onClick = { viewModel.clearAttachment() },
                        modifier = Modifier.size(24.dp)
                    ) {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = "Remove",
                            tint = TextTertiary,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }

        // ── Input Bar ────────────────────────────────────────────────────────
        ChatInputBar(
            text = inputText,
            onTextChange = { inputText = it },
            onSend = {
                viewModel.sendMessage(inputText)
                inputText = ""
                coroutineScope.launch {
                    if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size)
                }
            },
            onAttach = { filePicker.launch("*/*") },
            isLoading = isLoading,
            hasPendingFile = pendingFile != null
        )
    }
}

@Composable
private fun ChatHeader(
    hasActiveSession: Boolean = false,
    onNewSession: () -> Unit = {}
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    colors = listOf(CardSurface, DeepNavy)
                )
            )
            .padding(horizontal = 20.dp, vertical = 16.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(
                            colors = listOf(CyanAccent.copy(alpha = 0.3f), TealAccent.copy(alpha = 0.2f))
                        )
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Filled.SmartToy,
                    contentDescription = null,
                    tint = CyanAccent,
                    modifier = Modifier.size(22.dp)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Privacy Assistant",
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(StatusOnline)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        text = "Online • AI Powered",
                        style = MaterialTheme.typography.bodySmall.copy(
                            color = TextTertiary,
                            fontSize = 11.sp
                        )
                    )
                }
            }
            // New Session button
            if (hasActiveSession) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(NeonPurple.copy(alpha = 0.15f))
                        .border(0.5.dp, NeonPurple.copy(alpha = 0.3f), RoundedCornerShape(10.dp))
                        .clickable { onNewSession() }
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Filled.AddComment,
                            contentDescription = "New Session",
                            tint = NeonPurple,
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = "New",
                            color = NeonPurple,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyChat() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        val infiniteTransition = rememberInfiniteTransition(label = "emptyGlow")
        val glow by infiniteTransition.animateFloat(
            initialValue = 0.4f,
            targetValue = 0.9f,
            animationSpec = infiniteRepeatable(
                animation = tween(2500, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse
            ),
            label = "glow"
        )

        Icon(
            Icons.Filled.Forum,
            contentDescription = null,
            tint = CyanAccent.copy(alpha = glow),
            modifier = Modifier.size(64.dp)
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = "Ask me anything about your files",
            style = MaterialTheme.typography.titleSmall.copy(
                color = TextPrimary,
                fontWeight = FontWeight.SemiBold
            )
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = "Upload a file or describe your privacy concern",
            style = MaterialTheme.typography.bodySmall.copy(color = TextTertiary)
        )
        Spacer(Modifier.height(24.dp))

        // Quick suggestions
        val suggestions = listOf(
            "🔍 Scan this file for PII",
            "📊 Generate a privacy report",
            "🛡️ What sensitive data is here?"
        )
        suggestions.forEach { s ->
            SuggestionChip(text = s)
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun SuggestionChip(text: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(CardSurface.copy(alpha = 0.6f))
            .border(1.dp, BorderColor.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
            .padding(horizontal = 16.dp, vertical = 10.dp)
    ) {
        Text(
            text = text,
            color = TextSecondary,
            fontSize = 13.sp
        )
    }
}

@Composable
private fun ChatBubble(msg: UiChatMessage) {
    val isUser = msg.role == "user"

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomStart = if (isUser) 16.dp else 4.dp,
                        bottomEnd = if (isUser) 4.dp else 16.dp
                    )
                )
                .background(
                    if (isUser) {
                        Brush.linearGradient(
                            colors = listOf(
                                CyanAccent.copy(alpha = 0.2f),
                                TealAccent.copy(alpha = 0.12f)
                            )
                        )
                    } else {
                        Brush.linearGradient(
                            colors = listOf(
                                CardSurface.copy(alpha = 0.8f),
                                ElevatedSurface.copy(alpha = 0.6f)
                            )
                        )
                    }
                )
                .border(
                    width = 0.5.dp,
                    color = if (isUser) CyanAccent.copy(alpha = 0.15f) else BorderColor.copy(alpha = 0.3f),
                    shape = RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomStart = if (isUser) 16.dp else 4.dp,
                        bottomEnd = if (isUser) 4.dp else 16.dp
                    )
                )
                .padding(12.dp)
        ) {
            Column {
                // Attachment badge
                msg.attachmentName?.let { name ->
                    Row(
                        modifier = Modifier
                            .padding(bottom = 6.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(CyanAccent.copy(alpha = 0.1f))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Filled.AttachFile,
                            contentDescription = null,
                            tint = CyanAccent,
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = name,
                            color = CyanAccent,
                            fontSize = 11.sp,
                            maxLines = 1
                        )
                    }
                }

                Text(
                    text = msg.content,
                    color = if (isUser) TextPrimary else TextSecondary,
                    fontSize = 14.sp,
                    lineHeight = 20.sp
                )

                // Risk & entity chips (bot only)
                if (!isUser && (msg.riskScore != null || msg.flaggedEntities.isNotEmpty())) {
                    Spacer(Modifier.height(8.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        msg.riskScore?.let { score ->
                            val riskColor = when {
                                score >= 0.7f -> RiskRed
                                score >= 0.4f -> RiskAmber
                                else -> RiskGreen
                            }
                            MetadataChip(
                                label = "Risk: ${(score * 100).toInt()}%",
                                color = riskColor
                            )
                        }
                        if (msg.hasSensitiveData) {
                            MetadataChip(label = "⚠ Sensitive", color = RiskAmber)
                        }
                        if (msg.flaggedEntities.isNotEmpty()) {
                            MetadataChip(
                                label = "${msg.flaggedEntities.size} entities",
                                color = ElectricBlue
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MetadataChip(label: String, color: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = 8.dp, vertical = 3.dp)
    ) {
        Text(
            text = label,
            color = color,
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun TypingIndicator() {
    val infiniteTransition = rememberInfiniteTransition(label = "typing")

    Row(
        modifier = Modifier.padding(start = 4.dp, top = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(3) { index ->
            val delay = index * 200
            val alpha by infiniteTransition.animateFloat(
                initialValue = 0.3f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(600, delayMillis = delay),
                    repeatMode = RepeatMode.Reverse
                ),
                label = "dot$index"
            )
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(CyanAccent.copy(alpha = alpha))
            )
        }
        Spacer(Modifier.width(6.dp))
        Text(
            text = "Analyzing…",
            color = TextTertiary,
            fontSize = 12.sp
        )
    }
}

@Composable
private fun ChatInputBar(
    text: String,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit,
    onAttach: () -> Unit,
    isLoading: Boolean,
    hasPendingFile: Boolean = false
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color.Transparent, DeepNavy.copy(alpha = 0.9f), DeepNavy)
                )
            )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(CardSurface.copy(alpha = 0.9f))
                .border(1.dp, BorderColor.copy(alpha = 0.4f), RoundedCornerShape(24.dp))
                .padding(horizontal = 4.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Attach button
            IconButton(
                onClick = onAttach,
                modifier = Modifier.size(40.dp)
            ) {
                Icon(
                    Icons.Filled.AttachFile,
                    contentDescription = "Attach file",
                    tint = TextTertiary,
                    modifier = Modifier.size(20.dp)
                )
            }

            // Text input
            BasicTextField(
                value = text,
                onValueChange = onTextChange,
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 4.dp),
                textStyle = TextStyle(
                    color = TextPrimary,
                    fontSize = 15.sp
                ),
                cursorBrush = SolidColor(CyanAccent),
                maxLines = 4,
                decorationBox = { innerTextField ->
                    Box {
                        if (text.isEmpty()) {
                            Text(
                                text = "Ask about your file…",
                                color = TextTertiary,
                                fontSize = 15.sp
                            )
                        }
                        innerTextField()
                    }
                }
            )

            // Send button
            IconButton(
                onClick = onSend,
                enabled = !isLoading && (text.isNotBlank() || hasPendingFile),
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(
                        if (!isLoading && (text.isNotBlank() || hasPendingFile)) CyanAccent
                        else CyanAccent.copy(alpha = 0.3f)
                    )
            ) {
                Icon(
                    Icons.Filled.Send,
                    contentDescription = "Send",
                    tint = DeepNavy,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}
