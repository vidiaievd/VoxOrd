/**
 * Per-language data for the spelling exercise (Practice §7.4): the letters a phone keyboard
 * hides, and the key of «in Norwegian» in the interface language.
 */

const SPECIAL_LETTERS: Record<string, readonly string[]> = {
  nb: ['æ', 'ø', 'å'],
  nn: ['æ', 'ø', 'å'],
  no: ['æ', 'ø', 'å'],
  de: ['ä', 'ö', 'ü', 'ß'],
};

/** The language code of a course (`nb`, `nb-NO`, `DE`…) reduced to its base, lower-cased. */
function base(lang: string | null | undefined): string {
  return (lang ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
}

/** Letters to offer beside the answer field; empty when the language needs none. */
export function specialLetters(lang: string | null | undefined): readonly string[] {
  return SPECIAL_LETTERS[base(lang)] ?? [];
}

const LANG_IN_KEY: Record<string, string> = {
  nb: 'nb',
  nn: 'nb',
  no: 'nb',
  de: 'de',
  en: 'en',
};

/** i18n key of «write in {language}» for a course language, with a generic fallback. */
export function langInKey(lang: string | null | undefined): string {
  const code = LANG_IN_KEY[base(lang)];
  return code ? `reviewSession.langIn.${code}` : 'reviewSession.langInOther';
}

/**
 * Inserts `letter` into `text` replacing the selection, and returns the new text with the
 * caret just after the letter — what a special-letter button does.
 */
export function insertAt(
  text: string,
  selection: { start: number; end: number },
  letter: string,
): { text: string; caret: number } {
  const start = Math.max(0, Math.min(selection.start, text.length));
  const end = Math.max(start, Math.min(selection.end, text.length));
  return {
    text: text.slice(0, start) + letter + text.slice(end),
    caret: start + letter.length,
  };
}
