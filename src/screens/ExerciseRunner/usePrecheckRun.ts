import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { checkAttempt, PrecheckUnavailableError, type PrecheckResult } from '../../api/precheck';
import { useTranslation } from '../../i18n';

export interface PrecheckRun {
  /** A request is in flight. */
  busy: boolean;
  /** The last check that came back; null before the first, and while a new one runs. */
  result: PrecheckResult | null;
  /** Why the last attempt to check did not come back, in the learner's words. */
  error: string | null;
  /** No more asking: the school or the plan said no, so the button goes. */
  closed: boolean;
  /** Check this draft. Resolves to the result, or null when it did not come back. */
  run: (draftAnswer: unknown) => Promise<PrecheckResult | null>;
}

/**
 * One body's «Check» before hand-in: opens the attempt on first use (the check is made on it,
 * and a rehearsal leaves it `in_progress`), asks the engine, and keeps the last answer for the
 * panel. Shared by every template that has one.
 *
 * A refusal that will not change on its own — 403 `PRECHECK_NOT_AVAILABLE` — closes the
 * control; a network or server trouble leaves it, with a line to try again.
 */
export function usePrecheckRun(
  exerciseId: string,
  openAttempt: () => Promise<string>,
): PrecheckRun {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PrecheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  // A second press while one is in flight would spend a second check.
  const inFlight = useRef(false);

  const run = useCallback(
    async (draftAnswer: unknown): Promise<PrecheckResult | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      setResult(null);
      try {
        const attemptId = await openAttempt();
        const answer = await checkAttempt(exerciseId, attemptId, draftAnswer);
        setResult(answer);
        return answer;
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          setClosed(true);
        } else if (e instanceof ApiError && e.status === 409) {
          // Already handed in: nothing left to rehearse.
          setClosed(true);
        } else if (e instanceof PrecheckUnavailableError && e.reason === 'offline') {
          setError(t('exerciseRunner.precheck.offline'));
        } else {
          setError(t('exerciseRunner.precheck.failed'));
        }
        return null;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [exerciseId, openAttempt, t],
  );

  return { busy, result, error, closed, run };
}
