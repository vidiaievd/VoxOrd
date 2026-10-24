import { useCallback } from 'react';
import { useSettings } from '../hooks/useSettings';
import { settingsStore } from '../store/settingsStore';
import { Translations } from './types';
import { ru } from './ru';
import { uk } from './uk';
import { en } from './en';
import { isPluralForms, pickPlural } from './pluralize';

const TRANSLATIONS: Record<string, Translations> = { ru, uk, en };

// Variable substitution: t('home.wordCount', { learned: 5, total: 10 })
function interpolate(
  str: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return str;
  return Object.entries(vars).reduce(
    (acc, [key, val]) => acc.replace(`{${key}}`, String(val)),
    str,
  );
}

export function useTranslation() {
  const { uiLanguage } = useSettings();
  // Stable for a language: `t` sits in the dependencies of effects that hand state up to a
  // parent (a body's footer button), and a new `t` per render would re-run them on every
  // render the parent's update caused — a render loop nothing on screen would show.
  const t = useCallback(
    (path: string, vars?: Record<string, string | number>) => translateIn(uiLanguage, path, vars),
    [uiLanguage],
  );
  return { t, language: uiLanguage };
}

/**
 * A string in the current UI language, outside React — for text handed to the system, such
 * as the fingerprint prompt, which is shown before any screen has rendered.
 */
export function translate(path: string, vars?: Record<string, string | number>): string {
  return translateIn(settingsStore.getAll().uiLanguage, path, vars);
}

/** A string in a named language — for pure functions handed `t`, and for their tests. */
export function translateIn(
  uiLanguage: string,
  path: string,
  vars?: Record<string, string | number>,
): string {
  const translations = TRANSLATIONS[uiLanguage] ?? ru;
  const keys = path.split('.');
  let value: any = translations;

  for (const key of keys) {
    value = value?.[key];
    if (value === undefined) {
      console.warn(`[i18n] Missing key: ${path} for language: ${uiLanguage}`);
      let fallback: any = ru;
      for (const k of keys) fallback = fallback?.[k];
      value = fallback;
      break;
    }
  }

  // A `{ one, few, many }` entry needs `vars.count` to pick the right
  // grammatical form before the usual `{count}` interpolation runs.
  if (isPluralForms(value)) {
    const count = Number(vars?.count ?? 0);
    value = pickPlural(count, value, uiLanguage);
  }

  return interpolate(value ?? path, vars);
}
