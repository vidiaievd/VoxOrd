import { buildTranslateAnswer, translateCanSubmit } from './translate';

describe('buildTranslateAnswer', () => {
  it('wraps the trimmed text in accepted_translations', () => {
    expect(buildTranslateAnswer('  Familien bor i Bergen.  ')).toEqual({
      accepted_translations: ['Familien bor i Bergen.'],
    });
  });

  it('returns null for empty/whitespace-only text', () => {
    expect(buildTranslateAnswer('')).toBeNull();
    expect(buildTranslateAnswer('   ')).toBeNull();
  });
});

describe('translateCanSubmit', () => {
  it('is true once there is non-whitespace text', () => {
    expect(translateCanSubmit('hei')).toBe(true);
  });

  it('is false for empty or whitespace-only text', () => {
    expect(translateCanSubmit('')).toBe(false);
    expect(translateCanSubmit('   ')).toBe(false);
  });
});
