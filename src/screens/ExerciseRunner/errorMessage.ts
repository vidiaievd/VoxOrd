import { isNetworkError } from '../../api/isNetworkError';
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
