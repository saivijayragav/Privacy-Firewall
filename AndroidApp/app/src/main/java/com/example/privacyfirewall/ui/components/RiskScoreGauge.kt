package com.example.privacyfirewall.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.privacyfirewall.ui.theme.*

@Composable
fun RiskScoreGauge(
    score: Float,
    modifier: Modifier = Modifier,
    animate: Boolean = true
) {
    val animatedScore by animateFloatAsState(
        targetValue = if (animate) score.coerceIn(0f, 1f) else score.coerceIn(0f, 1f),
        animationSpec = tween(durationMillis = 1500, easing = FastOutSlowInEasing),
        label = "riskScore"
    )

    val scoreColor = when {
        animatedScore <= 0.4f -> RiskGreen
        animatedScore <= 0.7f -> RiskAmber
        else -> RiskRed
    }

    val gradientColors = when {
        animatedScore <= 0.4f -> listOf(RiskGreen, RiskGreen.copy(alpha = 0.6f))
        animatedScore <= 0.7f -> listOf(RiskAmber, RiskAmber.copy(alpha = 0.6f))
        else -> listOf(RiskRed, RiskRed.copy(alpha = 0.6f))
    }

    val label = when {
        animatedScore <= 0.4f -> "LOW RISK"
        animatedScore <= 0.7f -> "MEDIUM RISK"
        else -> "HIGH RISK"
    }

    Box(modifier = modifier.size(200.dp), contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.fillMaxSize().padding(16.dp)) {
            val strokeWidth = 14.dp.toPx()
            val arcSize = Size(size.width - strokeWidth, size.height - strokeWidth)
            val topLeft = Offset(strokeWidth / 2, strokeWidth / 2)

            // Background arc
            drawArc(
                color = ElevatedSurface,
                startAngle = 135f,
                sweepAngle = 270f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
            )

            // Score arc
            drawArc(
                brush = Brush.sweepGradient(gradientColors),
                startAngle = 135f,
                sweepAngle = 270f * animatedScore,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
            )
        }

        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "${(animatedScore * 100).toInt()}",
                style = MaterialTheme.typography.displayLarge.copy(
                    fontSize = 42.sp,
                    fontWeight = FontWeight.Bold,
                    color = scoreColor
                )
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    color = scoreColor,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 2.sp
                )
            )
        }
    }
}
