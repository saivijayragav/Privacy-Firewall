package com.example.privacyfirewall.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.privacyfirewall.data.models.FlaggedEntity
import com.example.privacyfirewall.data.models.SeverityLevel
import com.example.privacyfirewall.ui.theme.*

@Composable
fun EntityCard(
    entity: FlaggedEntity,
    modifier: Modifier = Modifier,
    trailingContent: @Composable (() -> Unit)? = null
) {
    GlassCard(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Type icon
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(entityTypeColor(entity.detected.type).copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = entityTypeIcon(entity.detected.type),
                    contentDescription = null,
                    tint = entityTypeColor(entity.detected.type),
                    modifier = Modifier.size(22.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = entity.detected.type.uppercase().replace("_", " "),
                        style = MaterialTheme.typography.titleSmall.copy(
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    SeverityBadge(severity = entity.contextual.severityLevel)
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = maskValue(entity.detected.rawValue),
                    style = MaterialTheme.typography.bodySmall.copy(
                        color = TextSecondary,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (entity.contextual.reasoning.isNotBlank()) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = entity.contextual.reasoning,
                        style = MaterialTheme.typography.bodySmall.copy(
                            color = TextTertiary,
                            fontSize = 11.sp
                        ),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                // Confidence bar
                Spacer(modifier = Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LinearProgressIndicator(
                        progress = { entity.contextual.confidenceScore },
                        modifier = Modifier
                            .weight(1f)
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp)),
                        color = CyanAccent,
                        trackColor = ElevatedSurface,
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "${(entity.contextual.confidenceScore * 100).toInt()}%",
                        style = MaterialTheme.typography.labelSmall.copy(color = TextTertiary)
                    )
                }
            }

            if (trailingContent != null) {
                Spacer(modifier = Modifier.width(8.dp))
                trailingContent()
            }
        }
    }
}

private fun maskValue(value: String): String {
    if (value.length <= 4) return "••••"
    return value.take(2) + "•".repeat((value.length - 4).coerceAtLeast(2)) + value.takeLast(2)
}

private fun entityTypeColor(type: String) = when {
    type.contains("aadhaar", true) -> SeverityHigh
    type.contains("pan", true) -> SeverityHigh
    type.contains("face", true) -> SeverityHigh
    type.contains("passport", true) -> SeverityHigh
    type.contains("phone", true) -> SeverityMedium
    type.contains("email", true) -> SeverityMedium
    type.contains("upi", true) -> SeverityMedium
    type.contains("credit", true) -> SeverityMedium
    type.contains("person", true) -> ElectricBlue
    type.contains("qr", true) -> NeonPurple
    else -> TealAccent
}

private fun entityTypeIcon(type: String) = when {
    type.contains("aadhaar", true) -> Icons.Filled.CreditCard
    type.contains("pan", true) -> Icons.Filled.Badge
    type.contains("face", true) -> Icons.Filled.Face
    type.contains("passport", true) -> Icons.Filled.Book
    type.contains("phone", true) -> Icons.Filled.Phone
    type.contains("email", true) -> Icons.Filled.Email
    type.contains("upi", true) -> Icons.Filled.Payment
    type.contains("credit", true) -> Icons.Filled.CreditCard
    type.contains("person", true) -> Icons.Filled.Person
    type.contains("qr", true) -> Icons.Filled.QrCode
    type.contains("driving", true) -> Icons.Filled.DirectionsCar
    type.contains("voter", true) -> Icons.Filled.HowToVote
    else -> Icons.Filled.DataObject
}
