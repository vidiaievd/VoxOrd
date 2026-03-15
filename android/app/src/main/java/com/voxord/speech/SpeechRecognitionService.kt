package com.voxord.speech

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

class SpeechRecognitionService(private val context: Context) {

  private var recognizer: SpeechRecognizer? = null

  var onStart:   (() -> Unit)?                    = null
  var onResult:  ((transcript: String, confidence: Float) -> Unit)? = null
  var onPartial: ((transcript: String) -> Unit)?  = null
  var onError:   ((code: Int, message: String) -> Unit)? = null
  var onEnd:     (() -> Unit)?                    = null

  fun isAvailable(): Boolean =
    SpeechRecognizer.isRecognitionAvailable(context)

  fun start(lang: String, contextualStrings: List<String>) {
    stop()

    recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
      setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
          onStart?.invoke()
        }

        override fun onPartialResults(partialResults: Bundle?) {
          val results = partialResults
            ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
          val transcript = results?.firstOrNull() ?: return
          onPartial?.invoke(transcript)
        }

        override fun onResults(results: Bundle?) {
          val transcripts = results
            ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
          val confidences = results
            ?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)

          val transcript = transcripts?.firstOrNull() ?: ""
          val confidence = confidences?.firstOrNull() ?: 0f

          onResult?.invoke(transcript, confidence)
          onEnd?.invoke()
        }

        override fun onError(error: Int) {
          val message = errorMessage(error)
          onError?.invoke(error, message)
          onEnd?.invoke()
        }

        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
      })
    }

    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
        RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
      putExtra(RecognizerIntent.EXTRA_CONFIDENCE_SCORES, true)
      // Contextual strings improve accuracy for known vocabulary
      if (contextualStrings.isNotEmpty()) {
        putExtra(RecognizerIntent.EXTRA_BIASING_STRINGS,
          ArrayList(contextualStrings))
      }
    }

    recognizer?.startListening(intent)
  }

  fun stop() {
    recognizer?.stopListening()
    recognizer?.destroy()
    recognizer = null
  }

  private fun errorMessage(code: Int): String = when (code) {
    SpeechRecognizer.ERROR_AUDIO              -> "audio-capture"
    SpeechRecognizer.ERROR_CLIENT             -> "client"
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
    SpeechRecognizer.ERROR_NETWORK            -> "network"
    SpeechRecognizer.ERROR_NETWORK_TIMEOUT    -> "network-timeout"
    SpeechRecognizer.ERROR_NO_MATCH           -> "no-match"
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY    -> "busy"
    SpeechRecognizer.ERROR_SERVER             -> "server"
    SpeechRecognizer.ERROR_SPEECH_TIMEOUT     -> "speech-timeout"
    else                                      -> "unknown"
  }
}