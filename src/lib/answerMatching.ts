/**
 * Comparing a typed answer against the expected word.
 *
 * The spelling exercise used to compare `trim().toLowerCase()` with `===`,
 * which made two things impossible in practice:
 *
 * 1. **Punctuation had to be typed exactly.** Seeded entries like
 *    `Det gjør ikke noe.` carry a trailing period, and the underscore hint
 *    renders it as just another `_` — so there was no way to discover it was
 *    required. Normalisation now drops punctuation on both sides.
 * 2. **A single slipped keystroke read as "did not know the word".** With the
 *    grader's rule 3 (spelling failed twice → `AGAIN`), two typos reset the
 *    FSRS schedule of a word the user actually knows. A near-miss is now its
 *    own outcome, graded `HARD` — recall was there, production was imperfect.
 *
 * No I/O, no React. Used by `useSpelling`; the tolerance thresholds are the
 * only tuning knob and are deliberately conservative for short words, where a
 * one-character edit is more likely to be a different word than a slip.
 */

/** Everything stripped before comparing; hyphens become spaces (see below). */
const PUNCTUATION = /[.,!?;:…"'’«»()[\]{}]/g;

/**
 * Lowercases, removes punctuation, treats hyphens as spaces and collapses
 * whitespace. Diacritics are preserved — `æ`, `ø`, `å` are letters, not
 * decoration, and folding them would accept genuinely wrong spellings.
 */
export function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(PUNCTUATION, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Standard Levenshtein edit distance (insert, delete, substitute). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Single-row DP: only the previous row is ever needed.
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1, // insertion
        previous[j] + 1, // deletion
        previous[j - 1] + cost, // substitution
      );
    }
    previous = current;
  }

  return previous[b.length];
}

/**
 * How many edits still count as a typo rather than a wrong answer.
 *
 * Short words get none: at four characters or fewer, one edit is a large part
 * of the word and is at least as likely to be a different word
 * (`tips`/`tid`) as a slip.
 */
export function typoTolerance(length: number): number {
  if (length <= 4) return 0;
  if (length <= 11) return 1;
  return 2;
}

export type AnswerVerdict = 'correct' | 'typo' | 'wrong';

/**
 * `correct` — matches once punctuation and spacing are normalised.
 * `typo` — within the edit tolerance for its length; accepted, but graded
 * `HARD` rather than counted as a success.
 * `wrong` — everything else.
 */
export function classifyAnswer(input: string, expected: string): AnswerVerdict {
  const normalizedInput = normalizeAnswer(input);
  const normalizedExpected = normalizeAnswer(expected);

  if (normalizedInput === normalizedExpected) return 'correct';
  // An empty answer is never a near-miss, however short the target is.
  if (normalizedInput.length === 0) return 'wrong';

  const tolerance = typoTolerance(normalizedExpected.length);
  if (tolerance === 0) return 'wrong';

  return levenshtein(normalizedInput, normalizedExpected) <= tolerance
    ? 'typo'
    : 'wrong';
}
