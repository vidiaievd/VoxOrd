export type ParagraphTone = 'plain' | 'read' | 'current' | 'unread';

/**
 * Which paragraphs the narration has passed, is on, and has yet to reach.
 *
 * The recording carries no timings per paragraph, so its position is spread over the
 * paragraphs by their length: a paragraph twice as long takes twice as much of the clip.
 * That is close enough to follow along by, and exact for nothing — it never gates anything.
 * Without a started recording every paragraph is `plain`.
 */
export function paragraphTones(
  lengths: readonly number[],
  narration: { started: boolean; position: number; duration: number },
): ParagraphTone[] {
  if (!narration.started || narration.duration <= 0) return lengths.map(() => 'plain');
  const total = lengths.reduce((sum, n) => sum + Math.max(1, n), 0);
  const ratio = Math.min(1, Math.max(0, narration.position / narration.duration));
  const at = ratio * total;

  let end = 0;
  let current = lengths.length - 1;
  for (let i = 0; i < lengths.length; i++) {
    end += Math.max(1, lengths[i]!);
    if (at < end) {
      current = i;
      break;
    }
  }
  return lengths.map((_, i) => (i < current ? 'read' : i === current ? 'current' : 'unread'));
}
