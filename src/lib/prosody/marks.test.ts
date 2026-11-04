import { emptyProsodyLayer, type ProsodyLayer, type SoundSeg } from '../../kernel/prosody';
import { chunksOf, drawnIn, faceSegs, marksByStart, signParts } from './marks';

const layer = (): ProsodyLayer => ({
  ...emptyProsodyLayer(),
  stresses: [
    { i: 1, w: 'heter', toneme: 1, vowel: { s: 1, e: 2, long: true }, source: 'lexicon' },
    { i: 2, w: 'Anna', toneme: 2, vowel: { s: 0, e: 1, long: false }, source: 'lexicon' },
  ],
  accents: [{ i: 2, w: 'Anna', source: 'teacher' }],
  boundaries: [{ i: 2, w: 'Anna', pitch: 'fall', pause: 'long', source: 'teacher' }],
});

const TEXT = 'Jeg heter Anna.\nHei!';

describe('marksByStart', () => {
  it('keys marks by the offset of their word', () => {
    const marks = marksByStart(TEXT, layer());
    expect(marks.get(4)?.stress?.toneme).toBe(1);
    expect(marks.get(10)?.accent).toBeDefined();
  });

  it('drops a mark whose anchor no longer matches its word', () => {
    const stale = layer();
    stale.stresses[0]!.w = 'heiter';
    expect(marksByStart(TEXT, stale).get(4)).toBeUndefined();
  });
});

describe('drawnIn', () => {
  it('draws a lens only where it has something', () => {
    const marks = marksByStart(TEXT, layer()).get(4)!;
    expect(drawnIn('stress', marks)).toBe(true);
    expect(drawnIn('sounds', marks)).toBe(false);
    expect(drawnIn(null, marks)).toBe(false);
  });
});

describe('faceSegs', () => {
  it('gives the word back letter for letter and marks the vowel', () => {
    const marks = marksByStart(TEXT, layer()).get(4)!;
    const segs = faceSegs('heter', marks, 'stress');
    expect(segs.map((s) => s.text).join('')).toBe('heter');
    expect(segs.find((s) => s.accent)).toMatchObject({ text: 'e', band: true });
  });

  it('fades silent letters and weak vowels under the sounds lens', () => {
    const segs: SoundSeg[] = [
      { s: 0, e: 1, kind: 'consonant', sounds: ['G'], stress: null, long: null, tie: false },
      { s: 1, e: 2, kind: 'vowel', sounds: ['OH'], stress: 1, long: false, tie: false },
      { s: 2, e: 3, kind: 'silent', sounds: [], stress: null, long: null, tie: false },
      { s: 3, e: 4, kind: 'consonant', sounds: ['T'], stress: null, long: null, tie: false },
    ];
    const out = faceSegs('godt', { word: 'godt', sounds: segs }, 'sounds');
    expect(out.map((s) => s.text).join('')).toBe('godt');
    expect(out[2]).toMatchObject({ text: 'd', fade: 0.22 });
    expect(out[1]).toMatchObject({ accent: true });
  });
});

describe('signParts', () => {
  it('stands the cross over the vowel by invisible letters before it', () => {
    const marks = marksByStart(TEXT, layer()).get(4)!;
    expect(signParts('heter', marks, 'stress')).toEqual([
      { kind: 'gap', text: 'h' },
      { kind: 'sign', text: '×', tone: 'accent', scale: 0.8 },
    ]);
  });

  it('puts the toneme sign, then the end of the group after the rest of the word', () => {
    const marks = marksByStart(TEXT, layer()).get(10)!;
    const parts = signParts('Anna', marks, 'melody')!;
    expect(parts.map((p) => p.text)).toEqual(['∨', 'nna', '↘‖']);
    expect(parts[0]).toMatchObject({ scale: 1 });
  });

  it('has no signs where the lens has nothing to say', () => {
    expect(signParts('Jeg', { word: 'Jeg' }, 'melody')).toBeNull();
  });
});

describe('chunksOf', () => {
  it('keeps every character once and counts line breaks', () => {
    const chunks = chunksOf(TEXT, layer());
    expect(chunks.map((c) => (c.word ?? '') + c.trailing).join('')).toBe(TEXT.replace('\n', ''));
    expect(chunks.find((c) => c.word === 'Anna')?.breaks).toBe(1);
  });

  it('keeps text before the first word', () => {
    const chunks = chunksOf('— Hei', emptyProsodyLayer());
    expect(chunks[0]).toMatchObject({ word: null, trailing: '— ' });
  });

  it('is empty for no text', () => {
    expect(chunksOf('', emptyProsodyLayer())).toEqual([]);
  });
});
