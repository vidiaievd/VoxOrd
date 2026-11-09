import type { TranslationLanguage } from '../api/accountPrefs';
import { currentUiLanguage, type UiLanguage } from '../i18n';
import { accountPrefsStore } from '../store/accountPrefsStore';

/** The language word translations are shown in: the learner's choice, else the interface's. */
export function resolveTranslationLanguage(
  chosen: TranslationLanguage | null,
  uiLanguage: UiLanguage,
): TranslationLanguage {
  return chosen ?? uiLanguage;
}

/** The translation language outside React (downloader, background sync). */
export function currentTranslationLanguage(): TranslationLanguage {
  return resolveTranslationLanguage(
    accountPrefsStore.getState().prefs.translationLanguage,
    currentUiLanguage(),
  );
}
