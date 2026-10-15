import { gradedOnPhone, gradeOffline, type ExerciseKey } from './index';

const instruction = (language: string, hint: string | null) => ({
  id: `i-${language}`,
  exerciseId: 'ex-1',
  instructionLanguage: language,
  instructionText: 'Fyll inn',
  hintText: hint,
});

const fibKey = (overrides: Partial<ExerciseKey> = {}): ExerciseKey => ({
  templateCode: 'fill_in_blank',
  expectedAnswers: {
    blanks: [
      { blank_id: 1, accepted_answers: ['bor'] },
      { blank_id: 2, accepted_answers: ['jobber'] },
    ],
  },
  answerCheckSettings: null,
  instructions: null,
  ...overrides,
});

const answer = (a: string, b: string) => ({
  blanks: [
    { blank_id: 1, accepted_answers: [a] },
    { blank_id: 2, accepted_answers: [b] },
  ],
});

describe('gradedOnPhone', () => {
  it('takes the templates the web grades in the browser, in their old form only', () => {
    expect(gradedOnPhone('fill_in_blank', {})).toBe(true);
    expect(gradedOnPhone('text_order', {})).toBe(true);
    expect(gradedOnPhone('multiple_choice', { question: 'x', options: [] })).toBe(true);
    expect(gradedOnPhone('multiple_choice', { questions: [] })).toBe(false);
    expect(gradedOnPhone('short_answer', { questions: [] })).toBe(false);
    expect(gradedOnPhone('match_pairs', {})).toBe(false);
    expect(gradedOnPhone('writing_task', {})).toBe(false);
  });
});

describe('gradeOffline', () => {
  it('answers in the shape of the engine, under the id it was given', () => {
    expect(gradeOffline(fibKey(), answer('bor', 'jobber'), 'ru', 'offline:x')).toEqual({
      attemptId: 'offline:x',
      correct: true,
      score: 100,
      requiresReview: false,
      feedback: { summary: 'Correct!' },
    });
  });

  it('reveals the key on a wrong answer, as PRACTICE does', () => {
    const verdict = gradeOffline(fibKey(), answer('bor', 'jobbet'), 'ru', 'offline:x');
    expect(verdict).toMatchObject({ correct: false, score: 50 });
    expect(verdict.feedback).toEqual({
      summary: 'Incorrect. Expected: bor / jobber',
      hints: undefined,
      correctAnswer: 'bor / jobber',
    });
  });

  it('says the instruction hint in the learner language, then English, then any', () => {
    const key = fibKey({ instructions: [instruction('nb', 'Hint nb'), instruction('en', 'Hint en')] });
    expect(gradeOffline(key, answer('x', 'y'), 'ru', 'o').feedback.summary).toBe('Hint en');
    expect(gradeOffline(key, answer('x', 'y'), 'nb', 'o').feedback.summary).toBe('Hint nb');
  });

  it('lays the exercise settings over the template defaults', () => {
    const strict = fibKey({ answerCheckSettings: { allow_partial_credit: false } });
    expect(gradeOffline(strict, answer('bor', 'jobbet'), 'ru', 'o').score).toBe(0);
    // multiple_choice defaults to no partial credit.
    const mc: ExerciseKey = {
      templateCode: 'multiple_choice',
      expectedAnswers: { correct_option_ids: ['a', 'b'] },
      answerCheckSettings: null,
      instructions: null,
    };
    expect(gradeOffline(mc, { correct_option_ids: ['a'] }, 'ru', 'o').score).toBe(0);
  });

  it('hands an answer nowhere near the key over for review', () => {
    const sa: ExerciseKey = {
      templateCode: 'short_answer',
      expectedAnswers: { reference_answer: 'Han var trøtt', accepted_answers: ['Han var trøtt'] },
      answerCheckSettings: null,
      instructions: null,
    };
    expect(gradeOffline(sa, { text: 'Vi drar til byen i morgen tidlig' }, 'ru', 'o')).toEqual({
      attemptId: 'o',
      correct: false,
      score: 0,
      requiresReview: true,
      feedback: { summary: 'Your answer has been submitted for review.' },
    });
  });
});
