import {
  classifyAnswer,
  levenshtein,
  normalizeAnswer,
  typoTolerance,
} from './answerMatching';

describe('normalizeAnswer', () => {
  it('lowercases and trims', () => {
    expect(normalizeAnswer('  Fantastisk  ')).toBe('fantastisk');
  });

  it('drops trailing punctuation that the hint could never reveal', () => {
    // Real seeded entry: the underscore hint renders the period as `_`.
    expect(normalizeAnswer('Det gjør ikke noe.')).toBe('det gjør ikke noe');
  });

  it('drops commas and ellipses inside a phrase', () => {
    expect(normalizeAnswer('Alle som er bosatt i Norge, ...')).toBe(
      'alle som er bosatt i norge',
    );
  });

  it('collapses repeated spaces', () => {
    expect(normalizeAnswer('lysere   tider')).toBe('lysere tider');
  });

  it('treats a hyphen as a space, so e-post and e post agree', () => {
    expect(normalizeAnswer('e-post')).toBe(normalizeAnswer('e post'));
  });

  it('preserves Norwegian letters — folding them would accept wrong spellings', () => {
    expect(normalizeAnswer('påvirke')).toBe('påvirke');
    expect(normalizeAnswer('kjærlig')).toBe('kjærlig');
    expect(normalizeAnswer('forsvinne')).not.toBe(normalizeAnswer('forsvinnø'));
  });
});

describe('levenshtein', () => {
  it('is zero for identical strings', () => {
    expect(levenshtein('tips', 'tips')).toBe(0);
  });

  it('counts a substitution', () => {
    expect(levenshtein('tips', 'tops')).toBe(1);
  });

  it('counts a transposition as two edits', () => {
    expect(levenshtein('fantastisk', 'fantastsik')).toBe(2);
  });

  it('counts an omission', () => {
    expect(levenshtein('fantastisk', 'fantastik')).toBe(1);
  });

  it('handles an empty side', () => {
    expect(levenshtein('', 'tips')).toBe(4);
    expect(levenshtein('tips', '')).toBe(4);
  });
});

describe('typoTolerance', () => {
  it('gives short words no tolerance at all', () => {
    expect(typoTolerance(3)).toBe(0);
    expect(typoTolerance(4)).toBe(0);
  });

  it('allows one edit for ordinary words', () => {
    expect(typoTolerance(5)).toBe(1);
    expect(typoTolerance(11)).toBe(1);
  });

  it('allows two edits once a word is long', () => {
    expect(typoTolerance(12)).toBe(2);
    expect(typoTolerance(20)).toBe(2);
  });
});

describe('classifyAnswer', () => {
  it('accepts an exact answer', () => {
    expect(classifyAnswer('fantastisk', 'fantastisk')).toBe('correct');
  });

  it('accepts an answer that differs only in case and spacing', () => {
    expect(classifyAnswer('  Lysere  Tider ', 'lysere tider')).toBe('correct');
  });

  it('accepts a missing trailing period as correct, not a typo', () => {
    expect(classifyAnswer('det gjør ikke noe', 'Det gjør ikke noe.')).toBe('correct');
  });

  it('treats one slipped keystroke in a long word as a typo', () => {
    expect(classifyAnswer('fantastik', 'fantastisk')).toBe('typo');
  });

  it('treats a transposition in a long word as a typo', () => {
    // 10 characters → tolerance 1, and a transposition costs 2, so this is
    // only forgiven once the word is long enough.
    expect(classifyAnswer('folkeregistert', 'folkeregistrert')).toBe('typo');
  });

  it('does not forgive an edit in a short word', () => {
    expect(classifyAnswer('tops', 'tips')).toBe('wrong');
    expect(classifyAnswer('tid', 'tips')).toBe('wrong');
  });

  it('rejects a genuinely different word', () => {
    expect(classifyAnswer('krangle', 'forsvinne')).toBe('wrong');
  });

  it('rejects an empty answer even for a long target', () => {
    expect(classifyAnswer('', 'folkeregistrert')).toBe('wrong');
    expect(classifyAnswer('   ', 'folkeregistrert')).toBe('wrong');
  });

  it('rejects an answer that is close but too far for its length', () => {
    // 7 characters → tolerance 1; two edits is a wrong answer.
    expect(classifyAnswer('kranglx', 'krangle')).toBe('typo');
    expect(classifyAnswer('kranxlx', 'krangle')).toBe('wrong');
  });
});
