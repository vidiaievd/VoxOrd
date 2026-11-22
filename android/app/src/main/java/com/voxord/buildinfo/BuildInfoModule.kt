package com.voxord.buildinfo

import androidx.core.content.pm.PackageInfoCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.voxord.BuildConfig

/** The installed build's name, number and commit, so a crash report names the APK it came from. */
class BuildInfoModule(ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  override fun getName() = "BuildInfo"

  override fun getConstants(): Map<String, Any> {
    val ctx = reactApplicationContext
    val info = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
    return mapOf(
      "versionName" to (info.versionName ?: ""),
      "versionCode" to PackageInfoCompat.getLongVersionCode(info).toString(),
      "commit" to BuildConfig.GIT_COMMIT,
      "buildType" to BuildConfig.BUILD_TYPE,
    )
  }
}
