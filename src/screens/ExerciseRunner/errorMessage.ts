import { isNetworkError } from '../../api/isNetworkError';
import { ApiError } from '../../api/client';
import { translate } from '../../i18n';
import { lifecycleErrorKey } from '../../lib/schoolLifecycle';

/** What the runner says when an exercise cannot load or be checked. */
export function runnerErrorMessage(e: unknown): string {
  // The learner's school is read only (plan 90, phase 5): say why, in words.
  const lifecycle = lifecycleErrorKey(e);
  if (lifecycle) return translate(`schoolLifecycle.${lifecycle}`);
  // Out of reach and not answerable on the phone (its key was never downloaded): the
  // transport's own words («Network request failed») say nothing to the learner (plan 90,
  // live check s22, finding 7).
  if (isNetworkError(e)) return translate('exerciseRunner.notOnPhone');
  return e instanceof Error ? e.message : String(e);
}

/**
 * What a step check (one question, sentence or row) says when the engine refused it.
 *
 * A read-only school is said in its own words: "try again" would send the learner pressing a
 * button the engine keeps refusing (OQ-S3 live check, session 10). A 422 is the step already
 * closed (`<scope>.<closedKey>`; `null` when the body has no such words); anything else is a lost send.
 */
export function stepSendError(
  e: unknown,
  t: (path: string) => string,
  scope: string,
  closedKey: string | null = 'closedAlready',
): string {
  const lifecycle = lifecycleErrorKey(e);
  if (lifecycle) return t(`schoolLifecycle.${lifecycle}`);
  if (closedKey && e instanceof ApiError && e.status === 422) return t(`${scope}.${closedKey}`);
  return t(`${scope}.sendFailed`);
}
