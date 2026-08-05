import { buildShortAnswerAnswer, extractReferenceAnswer, shortAnswerCanSubmit } from './shortAnswer';

describe('buildShortAnswerAnswer', () => {
  it('wraps the trimmed text', () => {
    expect(buildShortAnswerAnswer('  på radio  ')).toEqual({ text: 'på radio' });
  });

  it('returns null for empty/whitespace-only text', () => {
    expect(buildShortAnswerAnswer('')).toBeNull();
    expect(buildShortAnswerAnswer('   ')).toBeNull();
  });
});

describe('shortAnswerCanSubmit', () => {
  it('is true once there is non-whitespace text', () => {
    expect(shortAnswerCanSubmit('hei')).toBe(true);
  });

  it('is false for empty or whitespace-only text', () => {
    expect(shortAnswerCanSubmit('')).toBe(false);
    expect(shortAnswerCanSubmit('   ')).toBe(false);
  });
});

describe('extractReferenceAnswer', () => {
  it('reads reference_answer from a well-formed correctAnswer', () => {
    expect(extractReferenceAnswer({ reference_answer: 'Hun hørte det på radio.' })).toBe(
      'Hun hørte det på radio.',
    );
  });

  it('returns null for missing/malformed shapes', () => {
    expect(extractReferenceAnswer(null)).toBeNull();
    expect(extractReferenceAnswer({})).toBeNull();
    expect(extractReferenceAnswer({ reference_answer: 5 })).toBeNull();
  });
});
