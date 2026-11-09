import { resolveTranslationLanguage } from './translationLanguage';

describe('resolveTranslationLanguage', () => {
  it('follows the interface language until the learner chooses', () => {
    expect(resolveTranslationLanguage(null, 'uk')).toBe('uk');
    expect(resolveTranslationLanguage('en', 'uk')).toBe('en');
  });
});
