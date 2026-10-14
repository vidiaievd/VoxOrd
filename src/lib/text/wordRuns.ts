/**
 * Letters of the languages the reader shows — Latin with its accents and Norwegian æøå.
 * Spelled out rather than `\p{L}`: the reader must not depend on the engine's support for
 * Unicode property escapes.
 */
const LETTER = 'A-Za-zÀ-ÖØ-öø-ɏ';
const WORD = new RegExp(`[${LETTER}]+(?:[-'’][${LETTER}]+)*`, 'g');

export interface WordRun {
  text: string;
  /** A word the reader can tap; false for the spaces and punctuation between words. */
  isWord: boolean;
  /** Offset of the run in the text it was cut from. */
  start: number;
}

/** Cuts plain text into words and what lies between them, keeping every character. */
export function wordRuns(text: string): WordRun[] {
  const runs: WordRun[] = [];
  let last = 0;
  WORD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD.exec(text)) !== null) {
    if (match.index > last)
      runs.push({
        text: text.slice(last, match.index),
        isWord: false,
        start: last,
      });
    runs.push({ text: match[0], isWord: true, start: match.index });
    last = match.index + match[0].length;
  }
  if (last < text.length)
    runs.push({ text: text.slice(last), isWord: false, start: last });
  return runs;
}

/**
 * The sentence around `index` — what a word saved from the text keeps as its context.
 * A sentence ends at . ! ? or … followed by a space, or at a line break.
 */
export function sentenceAt(text: string, index: number): string {
  const ends = /[.!?…]+["»”)]*\s+|\n+/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = ends.exec(text)) !== null) {
    const end = match.index + match[0].length;
    if (end > index) return text.slice(start, end).trim();
    start = end;
  }
  return text.slice(start).trim();
}
