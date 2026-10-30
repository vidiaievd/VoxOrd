import { useSyncExternalStore } from 'react';
import type { TranslationLanguage } from '../api/accountPrefs';
import { useUiLanguage } from '../i18n';
import { resolveTranslationLanguage } from '../lib/translationLanguage';
import {
  accountPrefsStore,
  DEFAULT_DAILY_GOAL_MIN,
} from '../store/accountPrefsStore';

export interface ResolvedAccountPrefs {
  dailyGoalMin: number;
  /** The learner's choice; `null` follows the interface language. */
  translationLanguage: TranslationLanguage | null;
}

const subscribe = (listener: () => void) => accountPrefsStore.subscribe(listener);
const snapshot = () => accountPrefsStore.getState();

/** The learner's account-level preferences, defaults filled in. Change them through `accountPrefsStore.set`. */
export function useAccountPrefs(): ResolvedAccountPrefs {
  const { prefs } = useSyncExternalStore(subscribe, snapshot);
  return {
    dailyGoalMin: prefs.dailyGoalMin ?? DEFAULT_DAILY_GOAL_MIN,
    translationLanguage: prefs.translationLanguage,
  };
}

/** The language word translations are requested in. */
export function useTranslationLanguage(): TranslationLanguage {
  const { translationLanguage } = useAccountPrefs();
  return resolveTranslationLanguage(translationLanguage, useUiLanguage());
}
