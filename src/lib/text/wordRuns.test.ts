import { sentenceAt, wordRuns } from './wordRuns';

describe('wordRuns', () => {
  it('cuts words from the space and punctuation around them, losing nothing', () => {
    const runs = wordRuns('Hun bor i Bodø, på kysten.');
    expect(runs.filter(r => r.isWord).map(r => r.text)).toEqual([
      'Hun',
      'bor',
      'i',
      'Bodø',
      'på',
      'kysten',
    ]);
    expect(runs.map(r => r.text).join('')).toBe('Hun bor i Bodø, på kysten.');
  });

  it('keeps a hyphen or an apostrophe inside a word', () => {
    expect(
      wordRuns('Send en e-post')
        .filter(r => r.isWord)
        .map(r => r.text),
    ).toEqual(['Send', 'en', 'e-post']);
  });

  it('records where each run starts', () => {
    const runs = wordRuns('– Ja, takk.');
    const takk = runs.find(r => r.text === 'takk');
    expect(takk?.start).toBe(6);
  });

  it('has no words in digits and dashes alone', () => {
    expect(wordRuns('12 – 14').some(r => r.isWord)).toBe(false);
  });
});

describe('sentenceAt', () => {
  const text = 'Bartek kommer fra Polen. Han søker jobb! Kanskje i Oslo?';

  it('finds the sentence a word sits in', () => {
    expect(sentenceAt(text, text.indexOf('søker'))).toBe('Han søker jobb!');
    expect(sentenceAt(text, 0)).toBe('Bartek kommer fra Polen.');
    expect(sentenceAt(text, text.indexOf('Oslo'))).toBe('Kanskje i Oslo?');
  });

  it('ends a sentence at a line break', () => {
    expect(sentenceAt('Navn: Anne\nAlder: 34', 13)).toBe('Alder: 34');
  });
});
