import React from 'react';
import { useTranslation } from '../../i18n';
import { PrecheckButton, PrecheckPanel } from './PrecheckPanel';
import { mayAskAgain } from './templates/precheck';
import { usePrecheckRun } from './usePrecheckRun';

/**
 * «Check» before hand-in for a template whose body reports its draft in the shape a submission
 * has and has nothing of its own to show for a check (`writing_task`). The runner draws it under
 * the body; the footer keeps the hand-in. Remounted with the body for every item and retry, so a
 * panel never outlives the text it was about.
 */
export function RunnerPrecheck({
  exerciseId,
  answer,
  disabled,
  openAttempt,
}: {
  exerciseId: string;
  /** The body's draft, as it would be submitted; null while there is nothing to read. */
  answer: unknown;
  disabled: boolean;
  openAttempt: () => Promise<string>;
}) {
  const { t } = useTranslation();
  const check = usePrecheckRun(exerciseId, openAttempt);
  if (check.closed) return null;
  return (
    <>
      <PrecheckButton
        label={t('exerciseRunner.precheck.button')}
        busy={check.busy}
        disabled={disabled || answer === null || !mayAskAgain(check.result?.remaining ?? null)}
        error={check.error}
        onPress={() => void check.run(answer)}
      />
      {check.result !== null ? <PrecheckPanel result={check.result} /> : null}
    </>
  );
}
