package com.voxord.systembars

import android.graphics.Color
import androidx.core.view.WindowCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Paints the Android navigation bar to match the in-app theme (RN's StatusBar cannot). */
class SystemBarsModule(ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "SystemBars"

  @ReactMethod
  fun setNavigationBar(color: String, darkIcons: Boolean) {
    val activity = reactApplicationContext.currentActivity ?: return
    activity.runOnUiThread {
      val window = activity.window
      window.navigationBarColor = Color.parseColor(color)
      WindowCompat.getInsetsController(window, window.decorView)
        .isAppearanceLightNavigationBars = darkIcons
    }
  }
}
