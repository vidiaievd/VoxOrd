import { gradedOnPhone, gradeOffline, needsKey, type ExerciseKey } from './index';

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
  it('takes the kernel-graded templates handed in once, and writing for a teacher', () => {
    expect(gradedOnPhone('match_pairs', {})).toBe(true);
    expect(gradedOnPhone('translate_from_target', {})).toBe(true);
    expect(gradedOnPhone('error_correction', {})).toBe(true);
    expect(gradedOnPhone('writing_task', {})).toBe(true);
    // A text for a teacher needs no key to be queued.
    expect(needsKey('writing_task', {})).toBe(false);
    expect(needsKey('match_pairs', {})).toBe(true);
  });

  it('takes the templates the web grades in the browser, in their old form only', () => {
    expect(gradedOnPhone('fill_in_blank', {})).toBe(true);
    expect(gradedOnPhone('text_order', {})).toBe(true);
    expect(gradedOnPhone('multiple_choice', { question: 'x', options: [] })).toBe(true);
    expect(gradedOnPhone('multiple_choice', { questions: [] })).toBe(false);
    expect(gradedOnPhone('short_answer', { questions: [] })).toBe(false);
    expect(gradedOnPhone('dictation', {})).toBe(false);
    expect(gradedOnPhone('sort_into_buckets', {})).toBe(false);
  });
});

describe('gradeOffline', () => {
  it('answers in the shape of the engine, under the id it was given', () => {
    expect(gradeOffline(fibKey(), fibKey().templateCode, answer('bor', 'jobber'), 'ru', 'offline:x')).toEqual({
      attemptId: 'offline:x',
      correct: true,
      score: 100,
      requiresReview: false,
      feedback: { summary: 'Correct!' },
    });
  });

  it('reveals the key on a wrong answer, as PRACTICE does', () => {
    const verdict = gradeOffline(fibKey(), fibKey().templateCode, answer('bor', 'jobbet'), 'ru', 'offline:x');
    expect(verdict).toMatchObject({ correct: false, score: 50 });
    expect(verdict.feedback).toEqual({
      summary: 'Incorrect. Expected: bor / jobber',
      hints: undefined,
      correctAnswer: 'bor / jobber',
    });
  });

  it('says the instruction hint in the learner language, then English, then any', () => {
    const key = fibKey({ instructions: [instruction('nb', 'Hint nb'), instruction('en', 'Hint en')] });
    expect(gradeOffline(key, key.templateCode, answer('x', 'y'), 'ru', 'o').feedback.summary).toBe('Hint en');
    expect(gradeOffline(key, key.templateCode, answer('x', 'y'), 'nb', 'o').feedback.summary).toBe('Hint nb');
  });

  it('lays the exercise settings over the template defaults', () => {
    const strict = fibKey({ answerCheckSettings: { allow_partial_credit: false } });
    expect(gradeOffline(strict, strict.templateCode, answer('bor', 'jobbet'), 'ru', 'o').score).toBe(0);
    // multiple_choice defaults to no partial credit.
    const mc: ExerciseKey = {
      templateCode: 'multiple_choice',
      expectedAnswers: { correct_option_ids: ['a', 'b'] },
      answerCheckSettings: null,
      instructions: null,
    };
    expect(gradeOffline(mc, mc.templateCode, { correct_option_ids: ['a'] }, 'ru', 'o').score).toBe(0);
  });

  it('hands an answer nowhere near the key over for review', () => {
    const sa: ExerciseKey = {
      templateCode: 'short_answer',
      expectedAnswers: { reference_answer: 'Han var trøtt', accepted_answers: ['Han var trøtt'] },
      answerCheckSettings: null,
      instructions: null,
    };
    expect(gradeOffline(sa, sa.templateCode, { text: 'Vi drar til byen i morgen tidlig' }, 'ru', 'o')).toEqual({
      attemptId: 'o',
      correct: false,
      score: null,
      requiresReview: true,
      feedback: { summary: 'Your answer has been submitted for review.' },
    });
  });
});

describe('gradeOffline for a text a teacher marks', () => {
  it('queues it as the engine answers it, with no key at all', () => {
    expect(gradeOffline(null, 'writing_task', { text: 'Hei' }, 'ru', 'o')).toEqual({
      attemptId: 'o',
      correct: false,
      score: null,
      requiresReview: true,
      feedback: { summary: 'Your answer has been submitted for review.' },
    });
  });
});
