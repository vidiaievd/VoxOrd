package com.voxord.speech

import android.Manifest
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class SpeechRecognitionModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val service = SpeechRecognitionService(reactContext)
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun getName() = "SpeechRecognition"

  private fun emit(event: String, data: WritableMap?) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("SpeechRecognition.$event", data)
  }

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(service.isAvailable())
  }

  @ReactMethod
  fun hasPermission(promise: Promise) {
    val granted = ContextCompat.checkSelfPermission(
      reactApplicationContext,
      Manifest.permission.RECORD_AUDIO
    ) == PackageManager.PERMISSION_GRANTED
    promise.resolve(granted)
  }

  @ReactMethod
  fun start(lang: String, contextualStrings: ReadableArray) {
    val strings = (0 until contextualStrings.size())
      .map { contextualStrings.getString(it) ?: "" }

    service.onStart = {
      mainHandler.post { emit("start", null) }
    }
    service.onPartial = { transcript ->
      mainHandler.post {
        val map = Arguments.createMap().apply {
          putString("transcript", transcript)
          putBoolean("isFinal", false)
        }
        emit("result", map)
      }
    }
    service.onResult = { transcript, confidence ->
      mainHandler.post {
        val map = Arguments.createMap().apply {
          putString("transcript", transcript)
          putDouble("confidence", confidence.toDouble())
          putBoolean("isFinal", true)
        }
        emit("result", map)
      }
    }
    service.onError = { code, message ->
      mainHandler.post {
        val map = Arguments.createMap().apply {
          putInt("code", code)
          putString("message", message)
        }
        emit("error", map)
      }
    }
    service.onEnd = {
      mainHandler.post { emit("end", null) }
    }

    mainHandler.post { service.start(lang, strings) }
  }

  @ReactMethod
  fun stop() {
    mainHandler.post { service.stop() }
  }

  // Required for RN event emitter
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Double) {}
}