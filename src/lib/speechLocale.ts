const LOCALES: Record<string, string> = {
  no: 'no-NO',
  nb: 'no-NO',
  nn: 'no-NO',
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  sv: 'sv-SE',
  da: 'da-DK',
};

/**
 * The text-to-speech locale for a course's language code, or null when the phone is not
 * asked to read it — a button that would speak a language in the wrong accent is left out.
 */
export function speechLocale(language: string | null | undefined): string | null {
  if (!language) return null;
  return LOCALES[language.toLowerCase().split(/[-_]/)[0]!] ?? null;
}
