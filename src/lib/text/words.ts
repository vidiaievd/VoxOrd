/**
 * The word tokenizer — SPEC_data_model §2 of both `highlight_in_text` and `dictation`.
 *
 * **A copy of the kernel's expression** (`shared-kernel/src/text/words.ts`), because this app
 * does not consume the kernel. It must stay character for character the same: in
 * `highlight_in_text` a device that tokenized differently from the engine would send marks one
 * token off, and the engine refuses a mark that covers no token at all
 * (`HT_MARK_UNSNAPPABLE`); in `dictation` the word counter under the field would disagree with
 * the count the server checks against. The kernel's own fixture (`TOKENIZER_FIXTURE`, AC-M1)
 * runs against this copy in `templates/highlightInText.test.ts`, and the engine's suite runs it
 * too — change one side and the other fails.
 *
 * It started in `templates/highlightInText.ts` (plan 67) and moved here when `dictation`
 * needed the same words (plan 68, decision Q1-A), as the kernel's did.
 */
const WORD = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

export interface Token {
  /** Position in the passage, from 0. */
  i: number;
  /** The word as written. */
  w: string;
  /** Character offset of its first character. */
  s: number;
  /** Character offset one past its last character. */
  e: number;
}

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of (text ?? '').matchAll(WORD)) {
    const s = m.index ?? 0;
    out.push({ i: out.length, w: m[0], s, e: s + m[0].length });
  }
  return out;
}

/**
 * How many words a text has, as `dictation` counts them — the kernel's `wordCount`
 * (`dictation/tokens.ts`). Put into NFC first: a phone keyboard may hand over `å` as `a` +
 * U+030A, which the expression would split in two.
 */
export function wordCount(text: string): number {
  return tokenize((text ?? '').normalize('NFC')).length;
}
