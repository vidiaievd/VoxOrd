/**
 * Pure mapping logic for `match_pairs`. Wire shapes confirmed against
 * content-service's seeded template (seed.ts ~194-232) and exercise-engine's
 * `MatchPairsValidator` (match-pairs.validator.ts) — note the submitted shape
 * is `{ pairs: [{left_id, right_id}] }`, NOT a `links` map, even though a map
 * is the natural in-memory representation while the student is linking.
 */

export interface MatchPairItem {
  id: string;
  text: string;
}

/** `ExerciseDisplay.content` for this template. */
export interface MatchPairsContent {
  left_items: MatchPairItem[];
  right_items: MatchPairItem[];
  context?: string;
}

export interface MatchPairsAnswer {
  pairs: { left_id: string; right_id: string }[];
  explanation?: string;
}

/** In-memory linking state: left item id → linked right item id. */
export type Links = Record<string, string>;

/**
 * Applies a tap on `rightId` while `leftId` is selected:
 *   - any OTHER left currently linked to `rightId` is unlinked first (each
 *     right item pairs with at most one left at a time), then
 *   - tapping the right item already linked to this exact left unlinks it
 *     (toggle off), otherwise the link is (re)created.
 * Pure — returns a new Links object, never mutates the input.
 */
export function toggleLink(links: Links, leftId: string, rightId: string): Links {
  const next: Links = {};
  for (const [l, r] of Object.entries(links)) {
    if (l === leftId || r === rightId) continue; // drop stale links to either side
    next[l] = r;
  }
  const alreadyLinkedToThis = links[leftId] === rightId;
  if (!alreadyLinkedToThis) {
    next[leftId] = rightId;
  }
  return next;
}

export function matchPairsCanSubmit(links: Links, leftItems: MatchPairItem[]): boolean {
  return leftItems.length > 0 && leftItems.every((item) => links[item.id] !== undefined);
}

export function buildMatchPairsAnswer(
  links: Links,
  leftItems: MatchPairItem[],
): MatchPairsAnswer | null {
  if (!matchPairsCanSubmit(links, leftItems)) return null;
  return {
    pairs: leftItems.map((item) => ({ left_id: item.id, right_id: links[item.id] })),
  };
}

/** Reads `{left_id,right_id}[]` back out of an opaque `feedback.correctAnswer`. */
export function extractExpectedPairs(
  correctAnswer: unknown,
): { left_id: string; right_id: string }[] | null {
  if (
    !correctAnswer ||
    typeof correctAnswer !== 'object' ||
    !Array.isArray((correctAnswer as { pairs?: unknown }).pairs)
  ) {
    return null;
  }
  const pairs = (correctAnswer as MatchPairsAnswer).pairs;
  const valid = pairs.every(
    (p) => p && typeof p.left_id === 'string' && typeof p.right_id === 'string',
  );
  return valid ? pairs : null;
}

/** Whether a given left→right link is present in the expected pair set. */
export function isLinkExpected(
  expectedPairs: { left_id: string; right_id: string }[],
  leftId: string,
  rightId: string,
): boolean {
  return expectedPairs.some((p) => p.left_id === leftId && p.right_id === rightId);
}
