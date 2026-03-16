package com.example.privacyfirewall

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.example.privacyfirewall.navigation.BottomNavBar
import com.example.privacyfirewall.navigation.Screen
import com.example.privacyfirewall.ui.screens.*
import com.example.privacyfirewall.ui.theme.PrivacyFirewallTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            PrivacyFirewallTheme {
                val navController = rememberNavController()
                val backStackEntry by navController.currentBackStackEntryAsState()
                val currentRoute = backStackEntry?.destination?.route ?: Screen.Home.route

                val mainTabs = listOf(
                    Screen.Home.route,
                    Screen.QuickProcess.route,
                    Screen.ScanReview.route,
                    Screen.Files.route,
                    Screen.Chat.route
                )

                Scaffold(
                    bottomBar = {
                        AnimatedVisibility(
                            visible = currentRoute in mainTabs,
                            enter = slideInVertically(initialOffsetY = { it }) + fadeIn(animationSpec = tween(200)),
                            exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(animationSpec = tween(200))
                        ) {
                            BottomNavBar(
                                currentRoute = currentRoute,
                                onNavigate = { route ->
                                    navController.navigate(route) {
                                        popUpTo(Screen.Home.route) { saveState = true }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            )
                        }
                    }
                ) { paddingValues ->
                    NavHost(
                        navController = navController,
                        startDestination = Screen.Home.route,
                        modifier = Modifier.fillMaxSize().padding(paddingValues)
                    ) {
                        composable(Screen.Home.route) {
                            HomeScreen(
                                onNavigateToProcess = { navController.navigate(Screen.QuickProcess.route) },
                                onNavigateToScan = { navController.navigate(Screen.ScanReview.route) },
                                onNavigateToFiles = { navController.navigate(Screen.Files.route) },
                                onNavigateToSettings = { navController.navigate(Screen.Settings.route) }
                            )
                        }
                        composable(Screen.QuickProcess.route) {
                            QuickProcessScreen()
                        }
                        composable(Screen.ScanReview.route) {
                            ScanReviewScreen()
                        }
                        composable(Screen.Files.route) {
                            FileManagerScreen()
                        }
                        composable(Screen.Chat.route) {
                            ChatScreen()
                        }
                        composable(Screen.Settings.route) {
                            SettingsScreen(onBack = { navController.popBackStack() })
                        }
                    }
                }
            }
        }
    }
}