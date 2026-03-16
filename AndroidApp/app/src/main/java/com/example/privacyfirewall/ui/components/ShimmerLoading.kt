package com.example.privacyfirewall.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.privacyfirewall.ui.theme.CardSurface
import com.example.privacyfirewall.ui.theme.ElevatedSurface

@Composable
fun ShimmerLoading(
    modifier: Modifier = Modifier,
    itemCount: Int = 3
) {
    Column(
        modifier = modifier.fillMaxWidth().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        repeat(itemCount) {
            ShimmerCard()
        }
    }
}

@Composable
private fun ShimmerCard() {
    val shimmerColors = listOf(
        CardSurface.copy(alpha = 0.6f),
        ElevatedSurface.copy(alpha = 0.3f),
        CardSurface.copy(alpha = 0.6f)
    )
    val transition = rememberInfiniteTransition(label = "shimmer")
    val translateAnim by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmerTranslate"
    )
    val brush = Brush.linearGradient(
        colors = shimmerColors,
        start = Offset.Zero,
        end = Offset(x = translateAnim, y = translateAnim)
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(CardSurface.copy(alpha = 0.5f))
            .padding(16.dp)
    ) {
        ShimmerLine(brush = brush, width = 0.6f)
        Spacer(modifier = Modifier.height(12.dp))
        ShimmerLine(brush = brush, width = 0.9f)
        Spacer(modifier = Modifier.height(8.dp))
        ShimmerLine(brush = brush, width = 0.75f, height = 8.dp)
    }
}

@Composable
private fun ShimmerLine(brush: Brush, width: Float, height: Dp = 14.dp) {
    Box(
        modifier = Modifier
            .fillMaxWidth(width)
            .height(height)
            .clip(RoundedCornerShape(4.dp))
            .background(brush)
    )
}
