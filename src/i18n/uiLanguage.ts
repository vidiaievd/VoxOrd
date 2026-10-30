import { useSettings } from '../hooks/useSettings';
import { settingsStore } from '../store/settingsStore';
import { deviceLocaleTags } from './deviceLocales';

/** The languages the interface is translated into. */
export const UI_LANGUAGES = ['ru', 'uk', 'en'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

/** What the learner chose: a language, or «as on the phone». */
export type UiLanguagePref = UiLanguage | 'system';

/** Each language's name in itself — the main label of a language row. */
export const UI_LANGUAGE_ENDONYMS: Record<UiLanguage, string> = {
  ru: 'Русский',
  uk: 'Українська',
  en: 'English',
};

/** The language used when none of the phone's languages is translated. */
const FALLBACK: UiLanguage = 'en';

export function isUiLanguage(value: unknown): value is UiLanguage {
  return (UI_LANGUAGES as readonly unknown[]).includes(value);
}

/**
 * The first of the phone's languages, in the phone's order, that the interface has —
 * «nb-NO, uk-UA» gives Ukrainian, not English. Tags are BCP 47 («uk-UA», «zh-Hant-TW»);
 * only the language part counts.
 */
export function pickFromLocales(tags: readonly string[]): UiLanguage {
  for (const tag of tags) {
    const language = tag.split(/[-_]/)[0]?.toLowerCase();
    if (isUiLanguage(language)) return language;
  }
  return FALLBACK;
}

/**
 * The language the interface is shown in. A stored value the interface has no strings
 * for (an older build kept any `LanguageCode`) is read as «as on the phone».
 */
export function resolveUiLanguage(
  pref: string,
  tags: readonly string[] = deviceLocaleTags(),
): UiLanguage {
  return isUiLanguage(pref) ? pref : pickFromLocales(tags);
}

/** The resolved interface language, re-rendering on a new choice or a new phone language. */
export function useUiLanguage(): UiLanguage {
  return resolveUiLanguage(useSettings().uiLanguage);
}

/** The resolved interface language outside React. */
export function currentUiLanguage(): UiLanguage {
  return resolveUiLanguage(settingsStore.getAll().uiLanguage);
}
