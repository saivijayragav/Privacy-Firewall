package com.example.privacyfirewall.navigation

sealed class Screen(val route: String) {
    object Home : Screen("home")
    object QuickProcess : Screen("quick_process")
    object ScanReview : Screen("scan_review")
    object Files : Screen("files")
    object Chat : Screen("chat")
    object Settings : Screen("settings")
    object ProcessResult : Screen("process_result")
    object ScanResult : Screen("scan_result")
    object RedactResult : Screen("redact_result")
}
