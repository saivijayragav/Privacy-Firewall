package com.example.privacyfirewall.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val PrivacyFirewallDarkScheme = darkColorScheme(
    primary            = CyanAccent,
    onPrimary          = DeepNavy,
    primaryContainer   = ElectricBlue,
    onPrimaryContainer = TextPrimary,
    secondary          = TealAccent,
    onSecondary        = DeepNavy,
    secondaryContainer = ElevatedSurface,
    onSecondaryContainer = TextSecondary,
    tertiary           = NeonPurple,
    onTertiary         = DeepNavy,
    background         = DeepNavy,
    onBackground       = TextPrimary,
    surface            = DarkSurface,
    onSurface          = TextPrimary,
    surfaceVariant     = CardSurface,
    onSurfaceVariant   = TextSecondary,
    outline            = BorderColor,
    outlineVariant     = DividerColor,
    error              = RiskRed,
    onError            = TextPrimary
)

@Composable
fun PrivacyFirewallTheme(
    content: @Composable () -> Unit
) {
    val colorScheme = PrivacyFirewallDarkScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = DeepNavy.toArgb()
            window.navigationBarColor = DeepNavy.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = false
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}