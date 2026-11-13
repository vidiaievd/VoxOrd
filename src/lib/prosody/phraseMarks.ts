import type { ProsodyLayer } from '../../kernel/prosody';

/** Whether anyone marked the phrase (accents, group ends, linkings): the «Melody» lens means nothing without. */
export function hasPhraseMarks(layers: Iterable<ProsodyLayer>): boolean {
  for (const l of layers) {
    if (l.accents.length > 0 || l.boundaries.length > 0 || l.links.length > 0) return true;
  }
  return false;
}
