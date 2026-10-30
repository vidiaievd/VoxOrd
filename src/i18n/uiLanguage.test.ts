import { pickFromLocales, resolveUiLanguage } from './uiLanguage';

describe('resolveUiLanguage', () => {
  it('keeps a chosen language whatever the phone says', () => {
    expect(resolveUiLanguage('uk', ['en-US'])).toBe('uk');
    expect(resolveUiLanguage('en', ['ru-RU'])).toBe('en');
  });

  it('follows the phone on «system»', () => {
    expect(resolveUiLanguage('system', ['ru-RU'])).toBe('ru');
    expect(resolveUiLanguage('system', ['uk-UA'])).toBe('uk');
    expect(resolveUiLanguage('system', ['en-GB'])).toBe('en');
  });

  it('takes the first of the phone languages the interface has, in the phone order', () => {
    expect(resolveUiLanguage('system', ['nb-NO', 'uk-UA', 'en-US'])).toBe('uk');
  });

  it('falls back to English when the phone has none of them', () => {
    expect(resolveUiLanguage('system', ['nb-NO', 'de-DE'])).toBe('en');
    expect(resolveUiLanguage('system', [])).toBe('en');
  });

  it('reads a value an older build stored without strings for it as «system»', () => {
    expect(resolveUiLanguage('no', ['uk-UA'])).toBe('uk');
  });
});

describe('pickFromLocales', () => {
  it('reads only the language part of a tag, in any case and separator', () => {
    expect(pickFromLocales(['UK_ua'])).toBe('uk');
    expect(pickFromLocales(['zh-Hant-TW', 'ru'])).toBe('ru');
  });
});
