package com.voxord.speech

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log

class SpeechRecognitionService(private val context: Context) {

    var onStart:   (() -> Unit)?              = null
    var onPartial: ((String) -> Unit)?        = null
    var onResult:  ((String, Float) -> Unit)? = null
    var onError:   ((Int, String) -> Unit)?   = null
    var onEnd:     (() -> Unit)?              = null

    private var recognizer:   SpeechRecognizer? = null
    private var isDestroying: Boolean           = false
    private val mainHandler = Handler(Looper.getMainLooper())

    fun isAvailable(): Boolean =
        SpeechRecognizer.isRecognitionAvailable(context)

    fun start(lang: String, contextualStrings: List<String>) {
        // Destroy previous instance first
        recognizer?.destroy()
        recognizer = null

        // Delay to let Android fully release the recognizer (avoids ERROR_RECOGNIZER_BUSY)
        mainHandler.postDelayed({
            if (isDestroying) return@postDelayed
            startInternal(lang, contextualStrings)
        }, 150)
    }

    private fun startInternal(lang: String, contextualStrings: List<String>) {
        recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(object : RecognitionListener {

                override fun onReadyForSpeech(params: Bundle) {
                    Log.d("SpeechRecognition", "onReadyForSpeech")
                    onStart?.invoke()
                }

                override fun onBeginningOfSpeech() {
                    Log.d("SpeechRecognition", "onBeginningOfSpeech")
                }

                override fun onEndOfSpeech() {
                    Log.d("SpeechRecognition", "onEndOfSpeech")
                }

                override fun onPartialResults(partialResults: Bundle) {
                    val partial = partialResults
                        .getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    Log.d("SpeechRecognition", "onPartialResults: $partial")
                    val text = partial?.firstOrNull() ?: return
                    onPartial?.invoke(text)
                }

                override fun onResults(results: Bundle) {
                    val matches = results
                        .getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val scores = results
                        .getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
                    Log.d("SpeechRecognition",
                          "onResults: matches=$matches scores=${scores?.toList()}")

                    // Pick result with highest confidence score
                    val bestIndex  = scores?.indices?.maxByOrNull { scores[it] } ?: 0
                    val text       = matches?.getOrNull(bestIndex)
                                     ?: matches?.firstOrNull()
                                     ?: ""
                    val confidence = scores?.getOrNull(bestIndex) ?: 0f

                    onResult?.invoke(text, confidence)
                    onEnd?.invoke()
                }

                override fun onError(error: Int) {
                    val errorName = when (error) {
                        SpeechRecognizer.ERROR_AUDIO                    -> "error_audio"
                        SpeechRecognizer.ERROR_CLIENT                   -> "client"
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "insufficient_permissions"
                        SpeechRecognizer.ERROR_NETWORK                  -> "error_network"
                        SpeechRecognizer.ERROR_NETWORK_TIMEOUT          -> "error_network_timeout"
                        SpeechRecognizer.ERROR_NO_MATCH                 -> "no-match"
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY          -> "error_recognizer_busy"
                        SpeechRecognizer.ERROR_SERVER                   -> "error_server"
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT           -> "speech-timeout"
                        else                                            -> "unknown"
                    }
                    Log.e("SpeechRecognition", "onError: $errorName (code=$error)")
                    onError?.invoke(error, errorName)
                    onEnd?.invoke()
                }

                // Unused — required by interface
                override fun onRmsChanged(rmsdB: Float)              {}
                override fun onBufferReceived(buffer: ByteArray?)     {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                     RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            // Give recognizer more time — helps with short words like "hus", "mat"
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1500L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
            if (contextualStrings.isNotEmpty()) {
                putStringArrayListExtra(
                    RecognizerIntent.EXTRA_BIASING_STRINGS,
                    ArrayList(contextualStrings),
                )
            }
        }

        recognizer?.startListening(intent)
        Log.d("SpeechRecognition", "startListening: lang=$lang contextual=$contextualStrings")
    }

    fun stop() {
        Log.d("SpeechRecognition", "stop()")
        recognizer?.stopListening()
    }

    fun destroy() {
        Log.d("SpeechRecognition", "destroy()")
        isDestroying = true
        mainHandler.removeCallbacksAndMessages(null)
        recognizer?.destroy()
        recognizer    = null
        isDestroying  = false
    }
}