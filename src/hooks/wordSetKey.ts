/**
 * Dependency-array identity for a set of word ids — order-insensitive.
 *
 * The word exercises key their setup effect on the ids they were handed, and
 * that effect opens a `learning_sessions` row before loading its questions.
 * Keying on the array as written made a *reordering* look like a different set:
 * Deep Session reloads its words with `ORDER BY RANDOM()` between phases, so
 * the same words arrived shuffled, the effect re-ran, and the phase opened a
 * second — empty, never finished — session row. A set is the same set whatever
 * order it arrives in.
 *
 * "No override" and "an empty override" stay distinct, because the repositories
 * read them differently: no ids means *the whole deck*, while an empty list
 * means a `LIMIT 0` and no questions at all.
 */
export function wordSetKey(wordIds?: number[]): string {
  if (!wordIds) return 'all';
  if (wordIds.length === 0) return 'none';
  return [...wordIds].sort((a, b) => a - b).join(',');
}
