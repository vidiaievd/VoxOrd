/**
 * The runner footer's main label for an item no body has taken over (`setFooterAction`).
 *
 * Writing, error correction and translation are handed in, not checked on the spot: «Check»
 * there would also read the same as the model rehearsal button these bodies put above the
 * footer (plan 84), and the two buttons do different things. Same words as the web solvers.
 */
export type FooterLabelKey =
  | 'exerciseRunner.check'
  | 'exerciseRunner.send'
  | 'exerciseRunner.sendToTeacher';

const HANDED_IN = new Set(['writing_task', 'error_correction', 'translate']);

export function footerLabelKey(templateCode: string, precheckAvailable: boolean): FooterLabelKey {
  if (!HANDED_IN.has(templateCode)) return 'exerciseRunner.check';
  return precheckAvailable ? 'exerciseRunner.sendToTeacher' : 'exerciseRunner.send';
}
