import { buildGlossaryIndex, tokenizeGlossary } from './tokenizeGlossary';
import type { ReaderGlossaryEntry } from '../api/lessons';

function entry(overrides: Partial<ReaderGlossaryEntry> = {}): ReaderGlossaryEntry {
  return {
    id: 'vocab-1',
    word: 'hus',
    partOfSpeech: 'noun',
    translation: { language: 'ru', text: 'дом', definition: null },
    ...overrides,
  };
}

describe('tokenizeGlossary', () => {
  it('returns the whole text untagged when there is no glossary', () => {
    const tokens = tokenizeGlossary('Jeg bor i et hus.', buildGlossaryIndex([]));
    expect(tokens).toEqual([{ text: 'Jeg bor i et hus.', entry: null }]);
  });

  it('splits out a matched lemma as a tagged token', () => {
    const index = buildGlossaryIndex([entry()]);
    const tokens = tokenizeGlossary('Jeg bor i et hus.', index);

    expect(tokens.map((t) => t.text).join('')).toBe('Jeg bor i et hus.');
    const matched = tokens.find((t) => t.entry !== null);
    expect(matched).toMatchObject({ text: 'hus', entry: { id: 'vocab-1' } });
  });

  it('matches case-insensitively but preserves the original casing in the token', () => {
    const index = buildGlossaryIndex([entry({ word: 'hus' })]);
    const tokens = tokenizeGlossary('Hus er fint.', index);

    const matched = tokens.find((t) => t.entry !== null);
    expect(matched?.text).toBe('Hus');
  });

  it('prefers the longest lemma when one lemma is a substring of another', () => {
    const index = buildGlossaryIndex([entry({ id: 'a', word: 'hus' }), entry({ id: 'b', word: 'husdyr' })]);
    const tokens = tokenizeGlossary('Jeg har et husdyr.', index);

    const matched = tokens.find((t) => t.entry !== null);
    expect(matched).toMatchObject({ text: 'husdyr', entry: { id: 'b' } });
  });

  it('does not match a lemma that is only a substring of a longer word (word-boundary)', () => {
    const index = buildGlossaryIndex([entry({ word: 'hus' })]);
    const tokens = tokenizeGlossary('husdyr er fint.', index);

    expect(tokens.every((t) => t.entry === null)).toBe(true);
  });

  it('leaves inflected forms unmatched — a documented limitation, not a bug', () => {
    const index = buildGlossaryIndex([entry({ word: 'hus' })]);
    const tokens = tokenizeGlossary('husene er fine.', index);

    expect(tokens.every((t) => t.entry === null)).toBe(true);
  });
});
