import { useCallback, useEffect } from 'react';
import Tts from 'react-native-tts';
import { speechLocale } from '../../lib/speechLocale';

/**
 * Reads a word aloud in the deck's language — the speaker next to the word in the preview and
 * quiz phases. A language the phone has no voice for leaves the button silent rather than
 * reading Norwegian with an English voice.
 */
export function useSpeakWord(languageCode: string | null | undefined) {
  useEffect(() => () => void Tts.stop(), []);
  const locale = speechLocale(languageCode);

  const speak = useCallback(
    (word: string) => {
      if (!locale || !word) return;
      Tts.setDefaultLanguage(locale)
        .catch(() => undefined)
        .finally(() => {
          Tts.stop();
          Tts.speak(word);
        });
    },
    [locale],
  );

  return { speak, canSpeak: !!locale };
}
