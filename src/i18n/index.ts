import { useSettings } from '../hooks/useSettings';
import { Translations } from './types';
import { ru } from './ru';
import { uk } from './uk';
import { en } from './en';

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
  const translations = TRANSLATIONS[uiLanguage] ?? ru;

  function t(path: string, vars?: Record<string, string | number>): string {
    const keys = path.split('.');
    let value: any = translations;

    for (const key of keys) {
      value = value?.[key];
      if (value === undefined) {
        console.warn(`[i18n] Missing key: ${path} for language: ${uiLanguage}`);
        let fallback: any = ru;
        for (const k of keys) fallback = fallback?.[k];
        return interpolate(fallback ?? path, vars);
      }
    }

    return interpolate(value, vars);
  }

  return { t, language: uiLanguage };
}
