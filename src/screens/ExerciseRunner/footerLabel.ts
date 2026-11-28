/**
 * The runner footer's main button for an item no body has taken over (`setFooterAction`).
 *
 * Writing, error correction and translation are handed in, not checked on the spot: «Check»
 * there would also read the same as the model rehearsal button these bodies put above the
 * footer (plan 84), and the two buttons do different things. Same words as the web solvers.
 * A learner on their own hands work in to nobody at a school, so for them it is only «Done»
 * (OQ-S3 s19).
 */
export type FooterLabelKey =
  | 'exerciseRunner.check'
  | 'exerciseRunner.send'
  | 'exerciseRunner.sendToTeacher'
  | 'exerciseRunner.done';

const HANDED_IN = new Set(['writing_task', 'error_correction', 'translate']);

export function footerLabelKey(
  templateCode: string,
  { precheckAvailable, schoolLearner }: { precheckAvailable: boolean; schoolLearner: boolean },
): FooterLabelKey {
  if (!HANDED_IN.has(templateCode)) return 'exerciseRunner.check';
  if (!schoolLearner) return 'exerciseRunner.done';
  return precheckAvailable ? 'exerciseRunner.sendToTeacher' : 'exerciseRunner.send';
}

/**
 * Whether the footer button is drawn at all (OQ-S3 s19). A hand-in that cannot be made yet is
 * left out — a dead «Send» under the body's own «Check» read as two buttons, one broken. A
 * button checked on the spot stays, dimmed: it is the only control and says where the answer goes.
 */
export function footerButtonShown(templateCode: string, canSubmit: boolean, busy: boolean): boolean {
  return !HANDED_IN.has(templateCode) || canSubmit || busy;
}
