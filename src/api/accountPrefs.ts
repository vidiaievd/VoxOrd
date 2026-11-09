import { apiClient } from './client';
import { isRecord } from './guards';

/** The languages word translations can be shown in — the ones the content carries. */
export const TRANSLATION_LANGUAGES = ['ru', 'uk', 'en'] as const;
export type TranslationLanguage = (typeof TRANSLATION_LANGUAGES)[number];

/**
 * The learner's account-level preferences, shared by every device (mobile redesign 07,
 * step 8): user-profile-service `profiles/me/student/preferences`. `null` — not chosen; the
 * app applies its own default.
 */
export interface AccountPrefs {
  dailyGoalMin: number | null;
  /** `null` follows the interface language. */
  translationLanguage: TranslationLanguage | null;
}

/** A field left out stays as it is on the server; `null` clears it. */
export type AccountPrefsPatch = Partial<AccountPrefs>;

const PATH = '/api/v1/profiles/me/student/preferences';

export const isTranslationLanguage = (v: unknown): v is TranslationLanguage =>
  typeof v === 'string' &&
  (TRANSLATION_LANGUAGES as readonly string[]).includes(v);

/** The server's answer; anything it does not recognise reads as «not chosen». */
export function parseAccountPrefs(raw: unknown): AccountPrefs {
  const r = isRecord(raw) ? raw : {};
  const goal = r.dailyGoalMin;
  return {
    dailyGoalMin:
      typeof goal === 'number' && Number.isInteger(goal) && goal > 0
        ? goal
        : null,
    translationLanguage: isTranslationLanguage(r.translationLanguage)
      ? r.translationLanguage
      : null,
  };
}

export async function getAccountPrefs(): Promise<AccountPrefs> {
  return parseAccountPrefs(await apiClient.get<unknown>(PATH));
}

/** Sends a change; answers with the preferences as the server now holds them. */
export async function patchAccountPrefs(
  patch: AccountPrefsPatch,
): Promise<AccountPrefs> {
  return parseAccountPrefs(await apiClient.patch<unknown>(PATH, patch));
}
