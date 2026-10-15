import {
  judgeFillInBlank,
  judgeMultipleChoiceGroupLegacy,
  judgeMultipleChoiceLegacy,
  judgeShortAnswerLegacy,
  judgeTextOrder,
  judgeWordBankFill,
  SubmissionShapeError,
} from './judges';

/** Cases mirror exercise-engine-service's validator specs; the two must agree. */

const fibKey = {
  blanks: [
    { blank_id: 1, accepted_answers: ['bor', 'bur'] },
    { blank_id: 2, accepted_answers: ['jobber'] },
  ],
};
const fib = (a: string, b: string) => ({
  blanks: [
    { blank_id: 1, accepted_answers: [a] },
    { blank_id: 2, accepted_answers: [b] },
  ],
});

describe('judgeFillInBlank', () => {
  it('accepts any accepted answer, ignoring case and outer spaces by default', () => {
    expect(judgeFillInBlank(fib(' Bur ', 'JOBBER'), fibKey, {})).toEqual({
      correct: true,
      score: 100,
      requiresReview: false,
    });
  });

  it('gives partial credit unless switched off', () => {
    expect(judgeFillInBlank(fib('bor', 'jobbet'), fibKey, {}).score).toBe(50);
    expect(judgeFillInBlank(fib('bor', 'jobbet'), fibKey, { allow_partial_credit: false }).score).toBe(0);
  });

  it('honours case sensitivity and the fuzzy edit distance', () => {
    expect(judgeFillInBlank(fib('Bor', 'jobber'), fibKey, { case_sensitive: true }).correct).toBe(false);
    expect(judgeFillInBlank(fib('bor', 'jober'), fibKey, { fuzzy: { editDistance: 1 } }).correct).toBe(
      true,
    );
  });

  it('counts a missing blank as wrong', () => {
    const one = { blanks: [{ blank_id: 1, accepted_answers: ['bor'] }] };
    expect(judgeFillInBlank(one, fibKey, {}).score).toBe(50);
  });
});

describe('judgeWordBankFill', () => {
  const key = {
    items: [
      { id: 'a', blanks: [{ blank_id: 1, accepted_answers: ['hus'] }] },
      { id: 'b', blanks: [{ blank_id: 1, accepted_answers: ['bil'] }] },
    ],
  };

  it('grades every blank of every item, an empty one wrong', () => {
    const answer = {
      items: [
        { id: 'a', blanks: [{ blank_id: 1, accepted_answers: ['Hus'] }] },
        { id: 'b', blanks: [{ blank_id: 1, accepted_answers: [''] }] },
      ],
    };
    expect(judgeWordBankFill(answer, key, {})).toEqual({ correct: false, score: 50, requiresReview: false });
  });
});

describe('judgeTextOrder', () => {
  const key = { order: ['a', 'b', 'c'] };

  it('scores by position', () => {
    expect(judgeTextOrder({ order: ['a', 'b', 'c'] }, key, {}).correct).toBe(true);
    expect(judgeTextOrder({ order: ['a', 'c', 'b'] }, key, {}).score).toBe(33);
  });

  it('never fully credits an answer of the wrong length', () => {
    expect(judgeTextOrder({ order: ['a', 'b', 'c', 'x'] }, key, {})).toEqual({
      correct: false,
      score: 99,
      requiresReview: false,
    });
  });
});

describe('judgeMultipleChoiceLegacy', () => {
  const key = { correct_option_ids: ['o1', 'o3'] };

  it('wants the exact set unless partial credit is on', () => {
    expect(judgeMultipleChoiceLegacy({ correct_option_ids: ['o3', 'o1'] }, key, {}).correct).toBe(true);
    expect(judgeMultipleChoiceLegacy({ correct_option_ids: ['o1'] }, key, {}).score).toBe(0);
    expect(
      judgeMultipleChoiceLegacy({ correct_option_ids: ['o1'] }, key, { allow_partial_credit: true }).score,
    ).toBe(50);
  });

  it('lets each wrong pick cancel a right one', () => {
    expect(
      judgeMultipleChoiceLegacy({ correct_option_ids: ['o1', 'o2'] }, key, { allow_partial_credit: true })
        .score,
    ).toBe(0);
  });

  it('refuses an empty pick, as the engine does', () => {
    expect(() => judgeMultipleChoiceLegacy({ correct_option_ids: [] }, key, {})).toThrow(
      SubmissionShapeError,
    );
  });
});

describe('judgeMultipleChoiceGroupLegacy', () => {
  const key = {
    items: [
      { id: 'q1', correct_option_ids: ['a'] },
      { id: 'q2', correct_option_ids: ['b'] },
    ],
  };

  it('grades each question whole, a skipped one wrong', () => {
    expect(
      judgeMultipleChoiceGroupLegacy({ items: [{ id: 'q1', correct_option_ids: ['a'] }] }, key, {}),
    ).toEqual({ correct: false, score: 50, requiresReview: false });
  });
});

describe('judgeShortAnswerLegacy', () => {
  const key = { reference_answer: 'Han sa at han var trøtt', accepted_answers: ['Han sa at han var trøtt'] };

  it('accepts the answer whatever the case, unless case counts', () => {
    expect(judgeShortAnswerLegacy({ text: 'han sa at han var trøtt' }, key, {}).correct).toBe(true);
    expect(
      judgeShortAnswerLegacy({ text: 'han sa at han var trøtt' }, key, { case_sensitive: true }),
    ).toEqual({ correct: false, score: 0, requiresReview: false });
  });

  it('marks a near miss wrong with a partial score', () => {
    const outcome = judgeShortAnswerLegacy({ text: 'Han sa at han er trøtt' }, key, {});
    expect(outcome.correct).toBe(false);
    expect(outcome.requiresReview).toBe(false);
    expect(outcome.score).toBeGreaterThan(0);
  });

  it('sends an answer nowhere near the key to a person', () => {
    expect(judgeShortAnswerLegacy({ text: 'Jeg liker kaffe om morgenen veldig godt' }, key, {})).toEqual({
      correct: false,
      score: 0,
      requiresReview: true,
    });
  });
});
