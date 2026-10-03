/**
 * Which sentence of a `sentence_schema` set comes next, once the learner is allowed to
 * put one aside.
 *
 * The handoff has no answer here. Its runner walks the set in order and closes a sentence
 * only by solving it or by being shown it, so a learner who cannot see how a sentence goes
 * has exactly one way forward: read the answer. That is a bad trade — the sentence is
 * spent, scored nothing, and taught nothing, when all they needed was to come back to it
 * with the other four behind them.
 *
 * So a sentence can be deferred **once**. It goes to the back, the set carries on, and it
 * is offered again after the last one. The "once" is what keeps this finite: a learner who
 * defers it a second time is telling you they are done with it, and the set ends with that
 * sentence unsolved rather than cycling.
 *
 * Ported from the web runner's `sentence-set-order.ts` (plan 52, phase 4's fifth fix)
 * rather than shared: VoxOrd does not depend on `@ssz/shared-kernel`, and this is pure
 * ordering over ids — no key, no grading, nothing the two sides could disagree about
 * except by one of them being changed alone. The cases are the same on both, which is
 * what the tests beside this file are for.
 */

export interface SetPosition {
  /** Row ids, in the order the set is played. */
  ids: string[];
  /** Where the learner is now. */
  index: number;
  /** Rows finished — solved or shown. */
  isClosed: (rowId: string) => boolean;
  /** Rows put aside and still owed a second look, oldest first. */
  deferred: string[];
}

export interface SetStep {
  /** Where to go, or `null` when the set is over. */
  index: number | null;
  /** The queue as it stands after the move. */
  deferred: string[];
}

/**
 * The next sentence after this one.
 *
 * Forward first, then the deferred ones, then the end. Deferred rows are taken from the
 * front of the queue and dropped from it as they are offered: being offered again is the
 * whole of what a deferral buys.
 */
export function nextPosition(position: SetPosition): SetStep {
  const { ids, index, isClosed, deferred } = position;

  const ahead = ids.findIndex((id, at) => at > index && !isClosed(id) && !deferred.includes(id));
  if (ahead !== -1) return { index: ahead, deferred };

  const [owed, ...rest] = deferred;
  if (owed !== undefined) {
    const back = ids.indexOf(owed);
    // A row that vanished from the set between sittings is simply dropped from the queue.
    if (back !== -1) return { index: back, deferred: rest };
    return nextPosition({ ...position, deferred: rest });
  }

  return { index: null, deferred };
}

/**
 * Put the current sentence aside.
 *
 * A row already carried once is not queued again — `everDeferred` is the memory that makes
 * the second refusal final. The move itself is `nextPosition`, so skipping and finishing
 * take the same path through the set and cannot disagree about where it ends.
 */
export function deferPosition(position: SetPosition, everDeferred: readonly string[]): SetStep {
  const current = position.ids[position.index];
  if (current === undefined) return { index: null, deferred: position.deferred };

  const queue = everDeferred.includes(current)
    ? position.deferred
    : [...position.deferred, current];

  return nextPosition({ ...position, deferred: queue });
}
