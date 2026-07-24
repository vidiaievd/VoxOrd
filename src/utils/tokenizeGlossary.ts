import type { ReaderGlossaryEntry } from '../api/lessons';

export interface GlossaryToken {
  text: string;
  entry: ReaderGlossaryEntry | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a lemma → entry index for case-insensitive lookup while tokenizing.
 */
export function buildGlossaryIndex(
  entries: ReaderGlossaryEntry[],
): Map<string, ReaderGlossaryEntry> {
  return new Map(entries.map((entry) => [entry.word.toLowerCase(), entry]));
}

/**
 * Splits paragraph text into plain-text and glossary-word tokens by matching
 * lemma text (longest first, case-insensitive, word-boundary). Mirrors
 * ssz-platform-web's `tokenizeGlossary` — the backend stores no span/offset
 * for a glossary mark, so inflected forms in running text that don't equal
 * the stored lemma exactly won't be recognized. This is a known, accepted
 * limitation shared with the web reader, not a bug to fix here.
 */
export function tokenizeGlossary(
  text: string,
  index: Map<string, ReaderGlossaryEntry>,
): GlossaryToken[] {
  if (index.size === 0) return [{ text, entry: null }];

  const lemmas = [...index.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${lemmas.map(escapeRegExp).join('|')})\\b`, 'gi');

  const tokens: GlossaryToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, match.index), entry: null });
    }
    tokens.push({ text: match[0], entry: index.get(match[0].toLowerCase()) ?? null });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), entry: null });
  }

  return tokens;
}
