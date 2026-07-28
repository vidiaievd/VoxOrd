import { pickPlural, isPluralForms } from './pluralize';

const forms = { one: 'one', few: 'few', many: 'many' };

describe('pickPlural — Slavic (ru/uk)', () => {
  it.each([
    [1, 'one'],
    [21, 'one'],
    [101, 'one'],
    [2, 'few'],
    [3, 'few'],
    [4, 'few'],
    [22, 'few'],
    [24, 'few'],
    [0, 'many'],
    [5, 'many'],
    [11, 'many'],
    [12, 'many'],
    [13, 'many'],
    [14, 'many'],
    [111, 'many'],
    [112, 'many'],
    [20, 'many'],
    [25, 'many'],
  ])('%i -> %s', (count, expected) => {
    expect(pickPlural(count, forms, 'ru')).toBe(expected);
    expect(pickPlural(count, forms, 'uk')).toBe(expected);
  });

  it('treats negative counts by absolute value', () => {
    expect(pickPlural(-1, forms, 'ru')).toBe('one');
    expect(pickPlural(-4, forms, 'ru')).toBe('few');
  });
});

describe('pickPlural — English', () => {
  it('is one for 1, many otherwise', () => {
    expect(pickPlural(1, forms, 'en')).toBe('one');
    expect(pickPlural(0, forms, 'en')).toBe('many');
    expect(pickPlural(2, forms, 'en')).toBe('many');
    expect(pickPlural(21, forms, 'en')).toBe('many');
  });
});

describe('isPluralForms', () => {
  it('accepts a well-formed forms object', () => {
    expect(isPluralForms(forms)).toBe(true);
  });

  it('rejects plain strings and partial objects', () => {
    expect(isPluralForms('4 words')).toBe(false);
    expect(isPluralForms({ one: 'a', many: 'b' })).toBe(false);
    expect(isPluralForms(null)).toBe(false);
  });
});
