import { insertAt, langInKey, specialLetters } from './langLetters';

describe('specialLetters', () => {
  it('knows Norwegian and German, whatever the code looks like', () => {
    expect(specialLetters('nb')).toEqual(['æ', 'ø', 'å']);
    expect(specialLetters('nb-NO')).toEqual(['æ', 'ø', 'å']);
    expect(specialLetters('DE')).toEqual(['ä', 'ö', 'ü', 'ß']);
  });

  it('is empty for other languages and for no language', () => {
    expect(specialLetters('en')).toEqual([]);
    expect(specialLetters(null)).toEqual([]);
    expect(specialLetters(undefined)).toEqual([]);
  });
});

describe('langInKey', () => {
  it('maps the known languages and falls back for the rest', () => {
    expect(langInKey('nb')).toBe('reviewSession.langIn.nb');
    expect(langInKey('de-AT')).toBe('reviewSession.langIn.de');
    expect(langInKey('fr')).toBe('reviewSession.langInOther');
    expect(langInKey(undefined)).toBe('reviewSession.langInOther');
  });
});

describe('insertAt', () => {
  it('inserts at the caret', () => {
    expect(insertAt('bl', { start: 1, end: 1 }, 'å')).toEqual({ text: 'bål', caret: 2 });
  });

  it('replaces a selection', () => {
    expect(insertAt('bxl', { start: 1, end: 2 }, 'ø')).toEqual({ text: 'bøl', caret: 2 });
  });

  it('clamps a selection outside the text', () => {
    expect(insertAt('ab', { start: 9, end: 9 }, 'å')).toEqual({ text: 'abå', caret: 3 });
  });
});
