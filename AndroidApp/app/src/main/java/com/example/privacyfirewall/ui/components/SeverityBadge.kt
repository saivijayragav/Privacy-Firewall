package com.example.privacyfirewall.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.privacyfirewall.data.models.SeverityLevel
import com.example.privacyfirewall.ui.theme.*

@Composable
fun SeverityBadge(
    severity: SeverityLevel,
    modifier: Modifier = Modifier
) {
    val (bgColor, textColor, label) = when (severity) {
        SeverityLevel.HIGH   -> Triple(SeverityHigh.copy(alpha = 0.15f), SeverityHigh, "HIGH")
        SeverityLevel.MEDIUM -> Triple(SeverityMedium.copy(alpha = 0.15f), SeverityMedium, "MED")
        SeverityLevel.LOW    -> Triple(SeverityLow.copy(alpha = 0.15f), SeverityLow, "LOW")
    }

    Text(
        text = label,
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bgColor)
            .padding(horizontal = 8.dp, vertical = 2.dp),
        style = MaterialTheme.typography.labelSmall.copy(
            color = textColor,
            fontWeight = FontWeight.Bold,
            fontSize = 9.sp,
            letterSpacing = 1.sp
        )
    )
}
