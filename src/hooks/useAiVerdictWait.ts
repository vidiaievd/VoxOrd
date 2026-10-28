import { useCallback, useEffect, useRef, useState } from 'react';
import { getAttempt, type AttemptRow } from '../api/exercises';

/** How often the attempt is asked about while a model reads it. */
export const AI_VERDICT_POLL_MS = 2000;
/** When the screen stops asking and offers to ask again. */
export const AI_VERDICT_GIVE_UP_MS = 90_000;

export type AiVerdictWait =
  | { state: 'reading' }
  /** Gave up asking; `again` starts another round. */
  | { state: 'slow' }
  /** Out of the queue: a model's verdict (`SCORED` / `RETURNED`), or `NO_REVIEWER`. */
  | { state: 'settled'; attempt: AttemptRow };

/**
 * Waits for a model's verdict on work just handed in with `reviewer: 'ai'` (plan 79, 2.3d —
 * the web's `useAiVerdictWait`). A model answers in seconds, so the screen asks the attempt
 * every `AI_VERDICT_POLL_MS` while it is `ROUTED_FOR_REVIEW`, and reads whatever it left the
 * queue as: a verdict, or `NO_REVIEWER` when no model could read it. After
 * `AI_VERDICT_GIVE_UP_MS` it stops — the verdict will still come, but a loop with no end is
 * not worth the requests — and `again` asks for another round. A failed request counts as
 * «not yet».
 *
 * `attemptId` null: not waiting, and nothing is asked.
 */
export function useAiVerdictWait(
  exerciseId: string,
  attemptId: string | null,
): { wait: AiVerdictWait | null; again: () => void } {
  const [wait, setWait] = useState<AiVerdictWait | null>(null);
  /** Bumped by `again`, to restart the effect for the same attempt. */
  const [round, setRound] = useState(0);
  const current = useRef(attemptId);
  current.current = attemptId;

  useEffect(() => {
    if (attemptId === null) {
      setWait(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    setWait({ state: 'reading' });

    const tick = async () => {
      let attempt: AttemptRow | null = null;
      try {
        attempt = await getAttempt(exerciseId, attemptId);
      } catch {
        attempt = null;
      }
      if (cancelled) return;
      if (attempt !== null && attempt.status !== 'ROUTED_FOR_REVIEW') {
        setWait({ state: 'settled', attempt });
        return;
      }
      if (Date.now() - startedAt >= AI_VERDICT_GIVE_UP_MS) {
        setWait({ state: 'slow' });
        return;
      }
      timer = setTimeout(() => {
        tick();
      }, AI_VERDICT_POLL_MS);
    };
    timer = setTimeout(() => {
      tick();
    }, AI_VERDICT_POLL_MS);

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [exerciseId, attemptId, round]);

  const again = useCallback(() => {
    if (current.current !== null) setRound(r => r + 1);
  }, []);

  return { wait: attemptId === null ? null : wait, again };
}
