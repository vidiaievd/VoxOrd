import { readerBlocks, type Inline, type ReaderBlock } from '../text/readerBlocks';
import { inlineOffsets } from './blockOffsets';
import { hasPhraseMarks } from './phraseMarks';
import { emptyProsodyLayer } from '../../kernel/prosody';

describe('inlineOffsets', () => {
  it('places each block among the words of the whole paragraph', () => {
    const raw = '## Søknaden\nHan skriver kort.\n\n**Erik:** Hei Anna!\n- ett\n- to tre';
    const blocks = readerBlocks(raw);
    const offsets = inlineOffsets(raw, blocks);
    const at = (kind: 'heading' | 'text' | 'turn') => {
      const b = blocks.find((x) => x.kind === kind) as Extract<ReaderBlock, { inlines: Inline[] }>;
      return offsets.get(b.inlines);
    };
    expect(at('heading')).toBe(0);
    expect(at('text')).toBe(1);
    // Erik is counted as a word of the paragraph before his turn.
    expect(at('turn')).toBe(5);
    const list = blocks.find((b) => b.kind === 'list') as Extract<ReaderBlock, { kind: 'list' }>;
    expect(offsets.get(list.items[0]!)).toBe(7);
    expect(offsets.get(list.items[1]!)).toBe(8);
  });

  it('skips what the reader leaves out without losing the place', () => {
    const raw = '**Taras (svar):** Hei\n\n![bilde](media://abc123)\n\nTil slutt';
    const blocks = readerBlocks(raw);
    const offsets = inlineOffsets(raw, blocks);
    const last = blocks[blocks.length - 1] as Extract<ReaderBlock, { kind: 'text' }>;
    expect(offsets.get(last.inlines)).toBeGreaterThan(2);
  });

  it('leaves out a run it cannot find', () => {
    const blocks = readerBlocks('Hei Anna');
    expect(inlineOffsets('helt annen tekst her', blocks).size).toBe(0);
  });
});

describe('hasPhraseMarks', () => {
  it('is true only with an accent, a group end or a link', () => {
    expect(hasPhraseMarks([emptyProsodyLayer()])).toBe(false);
    const l = emptyProsodyLayer();
    l.links.push({ i: 0, w: 'a b', source: 'teacher' });
    expect(hasPhraseMarks([l])).toBe(true);
  });
});
