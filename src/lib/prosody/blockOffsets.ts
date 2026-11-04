import { tokenize } from '../../kernel/text/words';
import type { Inline, ReaderBlock } from '../text/readerBlocks';

/**
 * Where each run of a paragraph's text starts among the words of the whole paragraph.
 *
 * A pronunciation layer counts the words of the paragraph's Markdown; the reader shows that
 * Markdown cut into blocks — turns, headings, list items — with the marks left out. This finds,
 * for the words each block shows, their index in the paragraph, so the layer can be read
 * block by block. Keyed by the block's own `Inline[]` (the arrays `readerBlocks` made).
 *
 * The match is by the word itself, forward from where the last block ended, over a window:
 * what the reader leaves out (a stage direction in a speaker's name, an image's alt text and
 * its address) sits between blocks. A block it cannot place is left out of the map and is drawn
 * plain — a missing mark, never a misplaced one.
 */
const WINDOW = 60;

const plain = (inlines: Inline[]) => inlines.map((inline) => inline.text).join('');

export function inlineOffsets(raw: string, blocks: readonly ReaderBlock[]): Map<Inline[], number> {
  const source = tokenize(raw).map((t) => t.w.toLowerCase());
  const out = new Map<Inline[], number>();
  let cursor = 0;

  const place = (words: string[]): number | null => {
    if (words.length === 0) return null;
    for (let at = cursor; at <= Math.min(source.length - words.length, cursor + WINDOW); at++) {
      if (words.every((w, k) => source[at + k] === w)) {
        cursor = at + words.length;
        return at;
      }
    }
    return null;
  };

  const walk = (block: ReaderBlock) => {
    switch (block.kind) {
      case 'text':
      case 'heading':
        record(block.inlines);
        break;
      case 'turn':
        // The speaker is words of the paragraph too, said before the turn.
        place(tokenize(block.speaker).map((t) => t.w.toLowerCase()));
        record(block.inlines);
        break;
      case 'list':
        block.items.forEach(record);
        break;
      case 'document':
        block.blocks.forEach(walk);
        break;
      case 'table':
      case 'image':
        // Not drawn with marks; what they hold is skipped by the window.
        break;
    }
  };
  const record = (inlines: Inline[]) => {
    const at = place(tokenize(plain(inlines)).map((t) => t.w.toLowerCase()));
    if (at !== null) out.set(inlines, at);
  };

  blocks.forEach(walk);
  return out;
}

/** The plain text of a block's runs. */
export const inlinesText = plain;
