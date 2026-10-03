/**
 * Pure mapping logic for `match_pairs`.
 *
 * Both wire shapes changed with plan 49 (ssz-platform-web/docs/plan/49-match-pairs.md):
 *
 * - `content` is no longer the stored document but a **projection** of it. The server
 *   stores each pair whole — `pairs[].right` *is* the answer to `pairs[].left` — so
 *   handing the content over raw would ship the answer key. `toStudentProjection`
 *   (shared-kernel `match-pairs/projection.ts`, applied by content-service's
 *   `studentSafeContent`) cuts it into left halves as slots and a flat pool of right
 *   halves in which answers and distractors are indistinguishable, shuffled per attempt.
 * - the submission is `{ placements: [{ pairId, rightId }] }`, not
 *   `{ pairs: [{ left_id, right_id }] }` — see `MatchPairsValidator.readPlacements`
 *   in exercise-engine.
 *
 * The pool is longer than the list of slots: distractors are extra right halves that
 * complete nothing, so the last slot no longer solves itself by elimination.
 */

/** One left half, awaiting a right one. Mirrors `ProjectedSlot` in the kernel. */
export interface MatchPairsSlot {
  slotId: string;
  left: string;
}

/** One item of the pool. Nothing here says whether it is an answer or a distractor. */
export interface MatchPairsPoolItem {
  itemId: string;
  text: string;
}

/**
 * `ExerciseDisplay.content` for this template, as the kernel's `StudentProjection`.
 *
 * `settings` carries only what changes what the student sees: `shuffle` was already
 * applied server-side, and `distractors` was already applied to the pool's contents.
 */
export interface MatchPairsContent {
  variant: 'halves' | 'pairs';
  slots: MatchPairsSlot[];
  pool: MatchPairsPoolItem[];
  settings: { showRemaining: boolean };
}

/** One right half attached to one slot. Mirrors `Placement` in the kernel. */
export interface Placement {
  pairId: string;
  rightId: string;
}

export interface MatchPairsAnswer {
  placements: Placement[];
}

/** In-memory linking state: slot id → attached pool item id. */
export type Links = Record<string, string>;

/**
 * Applies a tap on `itemId` while `slotId` is selected:
 *   - any OTHER slot currently holding `itemId` gives it up first (a half lives in at
 *     most one slot at a time), then
 *   - tapping the item already in this exact slot removes it (toggle off), otherwise
 *     the item is (re)attached.
 * Pure — returns a new Links object, never mutates the input.
 */
export function toggleLink(links: Links, slotId: string, itemId: string): Links {
  const next: Links = {};
  for (const [slot, item] of Object.entries(links)) {
    if (slot === slotId || item === itemId) continue; // drop stale links on either side
    next[slot] = item;
  }
  const alreadyInThisSlot = links[slotId] === itemId;
  if (!alreadyInThisSlot) {
    next[slotId] = itemId;
  }
  return next;
}

/**
 * One filled slot is enough to check (`AC-S7`).
 *
 * Partial submission is deliberate, not a relaxation: a student who has matched three
 * of five learns most from checking those three. The server scores against every pair
 * in the exercise, not against the length of what was sent, so a partial submission is
 * scored honestly rather than flattered — three of five is 60%, not 100%.
 */
export function matchPairsCanSubmit(links: Links, slots: MatchPairsSlot[]): boolean {
  return slots.some((slot) => links[slot.slotId] !== undefined);
}

/**
 * Only the filled slots travel. An empty slot is *unanswered*, which the server records
 * as neither right nor wrong; sending it as an empty placement would make it wrong.
 * Slot order is kept so the verdict's details line up with what is on screen.
 */
export function buildMatchPairsAnswer(
  links: Links,
  slots: MatchPairsSlot[],
): MatchPairsAnswer | null {
  if (!matchPairsCanSubmit(links, slots)) return null;
  return {
    placements: slots
      .filter((slot) => links[slot.slotId] !== undefined)
      .map((slot) => ({ pairId: slot.slotId, rightId: links[slot.slotId] })),
  };
}

/** One slot's verdict, as `MatchPairsValidator` writes it into `details.pairs[]`. */
export interface MatchPairsResult {
  pairId: string;
  correct: boolean;
  /** The teacher's explanation for the half actually attached, or null if none applies. */
  explanation: string | null;
}

/**
 * Reads the per-slot verdicts out of a submit response.
 *
 * This replaces the old `extractExpectedPairs`, which parsed a display string
 * (`"l1 → r2, l2 → r4"`) out of `feedback.correctAnswer`. That string is gone:
 * `RuleBasedFeedbackGenerator` lost its `match_pairs` branch in plan 49 phase 2,
 * deliberately — in PRACTICE it ran with `revealAnswer` on, so the first wrong
 * submission would have handed over the whole mapping. Being wrong now yields the
 * teacher's explanation instead, and seeing the answer is a separate, recorded action.
 *
 * Reads `unknown` without throwing: a server that sent nothing (GRADED mode on an older
 * build, a template with no details) must leave the body rendering, not crash it.
 */
export function readMatchPairsResults(details: unknown): MatchPairsResult[] | null {
  if (typeof details !== 'object' || details === null) return null;
  const { pairs } = details as { pairs?: unknown };
  if (!Array.isArray(pairs)) return null;

  const out: MatchPairsResult[] = [];
  for (const raw of pairs) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { pairId, correct, explanation } = raw as Partial<MatchPairsResult>;
    if (typeof pairId !== 'string' || typeof correct !== 'boolean') return null;
    out.push({
      pairId,
      correct,
      explanation: typeof explanation === 'string' && explanation.length > 0 ? explanation : null,
    });
  }
  return out;
}
