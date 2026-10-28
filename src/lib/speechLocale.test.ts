import { speechLocale } from './speechLocale';

describe('speechLocale', () => {
  it('maps the course language codes, regions and Bokmål included', () => {
    expect(speechLocale('no')).toBe('no-NO');
    expect(speechLocale('nb-NO')).toBe('no-NO');
    expect(speechLocale('EN')).toBe('en-US');
  });

  it('is null for a language it does not speak and for no language', () => {
    expect(speechLocale('xx')).toBeNull();
    expect(speechLocale(null)).toBeNull();
    expect(speechLocale(undefined)).toBeNull();
  });
});
