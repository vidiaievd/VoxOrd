package com.voxord.audio

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min

/**
 * The microphone for `read_aloud` — plan 70, phase 10 (decision Q3-A).
 *
 * The hardware half of the recorder and nothing else. When a take starts, when it stops and
 * what an interruption costs are decided by the kernel's state machine in JS
 * (`src/lib/readAloud/recorder.ts`); this module opens the microphone when told, measures how
 * loud it is, writes a take to a file, and says when the phone took the microphone away.
 *
 *   - **A take** is AAC in MPEG-4, mono, 24 kbps (plan 70 §3.4 — the kernel's `LIMITS.bitrate`),
 *     written to the app's cache. Its length is measured here on the monotonic clock, not from
 *     the JS ticks, the way the browser adapter measures it.
 *   - **The meter** is `getMaxAmplitude`, polled every [LEVEL_MS] and emitted as a 0..1 level.
 *     The level check before the first prompt runs a recorder into a throwaway file — Android
 *     has no way to listen without recording — and deletes it; nothing of it is kept.
 *   - **Interruptions** — losing audio focus (a call, another app taking the microphone) and the
 *     input the take was recorded on disappearing (a headset unplugged) — are emitted as
 *     `AudioRecorder.interrupted` and the take is thrown away. The app going to the background
 *     is seen in JS (`AppState`), where the rest of the runner lives.
 *
 * Every method runs on the main looper, so the recorder is never touched from two threads.
 */
class AudioRecorderModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val LEVEL_MS = 90L
    private const val ENVELOPE_MS = 100L
    private const val BITRATE = 24_000
    private const val SAMPLE_RATE = 44_100
    /** The quietest amplitude the meter shows above zero, in dBFS. */
    private const val FLOOR_DB = -50.0
    /** Normal speech close to a phone sits around here; louder reads as full. */
    private const val CEIL_DB = -10.0
  }

  private val main = Handler(Looper.getMainLooper())
  private val audio = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private var recorder: MediaRecorder? = null
  private var file: File? = null
  /** True while the recorder is the level check's, not a take's. */
  private var metering = false
  private var startedAt = 0L
  private val envelope = ArrayList<Double>()
  private var lastEnvelopeAt = 0L
  private var focusRequest: AudioFocusRequest? = null
  private var focused = false

  override fun getName() = "AudioRecorder"

  private fun emit(event: String, data: WritableMap?) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("AudioRecorder.$event", data)
  }

  private fun dir(): File =
    File(reactApplicationContext.cacheDir, "read-aloud").apply { mkdirs() }

  // ── Levels ────────────────────────────────────────────────────────────────

  private val poll = object : Runnable {
    override fun run() {
      val r = recorder ?: return
      val amplitude = try { r.maxAmplitude } catch (_: Exception) { 0 }
      val level = toLevel(amplitude)
      emit("level", Arguments.createMap().apply { putDouble("value", level) })
      if (!metering) {
        val now = SystemClock.elapsedRealtime()
        if (now - lastEnvelopeAt >= ENVELOPE_MS) {
          envelope.add(level)
          lastEnvelopeAt = now
        }
      }
      main.postDelayed(this, LEVEL_MS)
    }
  }

  private fun toLevel(amplitude: Int): Double {
    if (amplitude <= 0) return 0.0
    val db = 20 * log10(amplitude / 32767.0)
    return min(1.0, max(0.0, (db - FLOOR_DB) / (CEIL_DB - FLOOR_DB)))
  }

  // ── Interruptions ─────────────────────────────────────────────────────────

  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    if (change == AudioManager.AUDIOFOCUS_LOSS ||
      change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
    ) {
      main.post { interrupt("ended") }
    }
  }

  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) {
      // Only the input the take is recorded on going away matters: headphones without a
      // microphone, or a headset the phone was not recording from, cost the student nothing —
      // the same rule the browser adapter keeps.
      val routed = try { recorder?.routedDevice } catch (_: Exception) { null }
      val gone = if (routed != null) removed.any { it.id == routed.id } else removed.any { it.isSource }
      if (gone) main.post { interrupt("deviceChanged") }
    }
  }

  private fun interrupt(reason: String) {
    if (recorder == null || metering) return
    discard()
    emit("interrupted", Arguments.createMap().apply { putString("reason", reason) })
  }

  private fun takeFocus(): Boolean {
    focused = true
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
        .setOnAudioFocusChangeListener(focusListener, main)
        .build()
      focusRequest = request
      audio.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audio.requestAudioFocus(
        focusListener,
        AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE,
      )
    }
    return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }

  private fun releaseFocus() {
    if (!focused) return
    focused = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { audio.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      audio.abandonAudioFocus(focusListener)
    }
  }

  // ── The recorder ──────────────────────────────────────────────────────────

  @Suppress("DEPRECATION")
  private fun newRecorder(): MediaRecorder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(reactApplicationContext)
    else MediaRecorder()

  /** Starts a recorder into [target]; throws when the microphone cannot be had. */
  private fun begin(target: File) {
    val r = newRecorder()
    try {
      r.setAudioSource(MediaRecorder.AudioSource.MIC)
      r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      r.setAudioChannels(1)
      r.setAudioSamplingRate(SAMPLE_RATE)
      r.setAudioEncodingBitRate(BITRATE)
      r.setOutputFile(target.absolutePath)
      r.prepare()
      r.start()
    } catch (e: Exception) {
      r.release()
      target.delete()
      throw e
    }
    recorder = r
    file = target
    startedAt = SystemClock.elapsedRealtime()
    main.removeCallbacks(poll)
    main.postDelayed(poll, LEVEL_MS)
  }

  /** Stops whatever runs and keeps nothing. */
  private fun discard() {
    main.removeCallbacks(poll)
    recorder?.let {
      try { it.stop() } catch (_: Exception) { /* stopped before any data — nothing to keep */ }
      it.release()
    }
    recorder = null
    file?.delete()
    file = null
    metering = false
    envelope.clear()
    releaseFocus()
    audio.unregisterAudioDeviceCallback(deviceCallback)
  }

  private fun hasMicrophone(): Boolean =
    reactApplicationContext.packageManager.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)

  private fun granted(): Boolean =
    ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED

  /** `ok`, `denied` or `noDevice` — whether a take could start now. The permission is asked in JS. */
  @ReactMethod
  fun probe(promise: Promise) {
    promise.resolve(
      when {
        !hasMicrophone() -> "noDevice"
        !granted() -> "denied"
        else -> "ok"
      },
    )
  }

  /** The level check: the meter runs, nothing is kept. */
  @ReactMethod
  fun startMeter(promise: Promise) {
    main.post {
      if (recorder != null) {
        promise.resolve("ok")
        return@post
      }
      try {
        metering = true
        begin(File.createTempFile("meter-", ".m4a", dir()))
        promise.resolve("ok")
      } catch (e: Exception) {
        metering = false
        promise.resolve("noDevice")
      }
    }
  }

  @ReactMethod
  fun stopMeter() {
    main.post { if (metering) discard() }
  }

  /** A take. The level check, if it is still running, gives way to it. */
  @ReactMethod
  fun start(promise: Promise) {
    main.post {
      if (recorder != null && !metering) {
        promise.resolve("ok")
        return@post
      }
      if (metering) discard()
      try {
        takeFocus()
        audio.registerAudioDeviceCallback(deviceCallback, main)
        envelope.clear()
        lastEnvelopeAt = 0L
        begin(File.createTempFile("take-", ".m4a", dir()))
        promise.resolve("ok")
      } catch (e: Exception) {
        discard()
        promise.resolve("noDevice")
      }
    }
  }

  /**
   * Finishes the take: `{ path, mimeType, seconds, envelope }`, or null when there was none —
   * nothing running, or stopped before the encoder had written anything.
   */
  @ReactMethod
  fun stop(promise: Promise) {
    main.post {
      val r = recorder
      val target = file
      if (r == null || target == null || metering) {
        promise.resolve(null)
        return@post
      }
      main.removeCallbacks(poll)
      val seconds = (SystemClock.elapsedRealtime() - startedAt) / 1000.0
      val ok = try {
        r.stop()
        true
      } catch (_: Exception) {
        false
      }
      r.release()
      recorder = null
      file = null
      releaseFocus()
      audio.unregisterAudioDeviceCallback(deviceCallback)
      if (!ok || target.length() == 0L) {
        target.delete()
        envelope.clear()
        promise.resolve(null)
        return@post
      }
      val samples = Arguments.createArray()
      envelope.forEach { samples.pushDouble(it) }
      envelope.clear()
      promise.resolve(
        Arguments.createMap().apply {
          putString("path", target.absolutePath)
          putString("mimeType", "audio/mp4")
          putDouble("seconds", seconds)
          putInt("size", target.length().toInt())
          putArray("envelope", samples)
        },
      )
    }
  }

  /** Throw the running take away — an interruption is not the student's attempt. */
  @ReactMethod
  fun cancel() {
    main.post { if (!metering) discard() }
  }

  /** Release the microphone and every take file of this session. */
  @ReactMethod
  fun close() {
    main.post {
      discard()
      dir().listFiles()?.forEach { it.delete() }
    }
  }

  // Required for RN event emitter
  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Double) {}

  override fun invalidate() {
    main.post { discard() }
    super.invalidate()
  }
}
