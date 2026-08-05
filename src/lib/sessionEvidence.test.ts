import {
  answeredCount,
  createEvidence,
  gradeSession,
  recordWordAttempt,
  type SessionEvidence,
} from './sessionEvidence';
import { gradePersonalWord, type AttemptResult, type SessionMode } from './sessionGrader';

type Step = [number, SessionMode, boolean] | [number, SessionMode, boolean, Partial<AttemptResult>];

function play(steps: Step[]): SessionEvidence {
  return steps.reduce<SessionEvidence>(
    (evidence, [wordId, mode, correct, extra = {}]) =>
      recordWordAttempt(evidence, wordId, mode, { correct, ...extra }),
    createEvidence(),
  );
}

describe('recordWordAttempt', () => {
  it('keeps words independent', () => {
    const evidence = play([
      [1, 'quiz', true],
      [2, 'quiz', false],
    ]);

    expect(evidence.byWordId[1]).toEqual([
      {
        mode: 'quiz',
        failedAttempts: 0,
        eventuallyCorrect: true,
        hintUsed: false,
        gaveUp: false,
        typoed: false,
      },
    ]);
    expect(evidence.byWordId[2][0].failedAttempts).toBe(1);
  });

  it('accumulates several modes under one word', () => {
    const evidence = play([
      [1, 'quiz', true],
      [1, 'spelling', true],
    ]);

    expect(evidence.byWordId[1].map((o) => o.mode)).toEqual(['quiz', 'spelling']);
  });

  it('does not mutate the previous ledger', () => {
    const first = play([[1, 'quiz', true]]);
    const second = recordWordAttempt(first, 1, 'spelling', { correct: true });

    expect(first.byWordId[1]).toHaveLength(1);
    expect(second.byWordId[1]).toHaveLength(2);
  });
});

describe('gradeSession', () => {
  it('emits exactly one rating per word regardless of how many modes it saw', () => {
    const evidence = play([
      [1, 'quiz', true],
      [1, 'listening', true],
      [1, 'spelling', true],
    ]);

    expect(gradeSession(evidence)).toEqual([{ wordId: 1, rating: 'EASY' }]);
  });

  it('grades each word on its own evidence', () => {
    const evidence = play([
      [1, 'quiz', true],
      [2, 'quiz', false],
      [2, 'quiz', true],
    ]);

    expect(gradeSession(evidence).sort((a, b) => a.wordId - b.wordId)).toEqual([
      { wordId: 1, rating: 'GOOD' },
      { wordId: 2, rating: 'AGAIN' },
    ]);
  });

  it('drops words with no usable evidence instead of defaulting them', () => {
    // Presented but abandoned mid-question: recorded by no attempt at all.
    const evidence = createEvidence();
    expect(gradeSession(evidence)).toEqual([]);
  });

  it('returns numeric word ids, not the object keys stringified', () => {
    const [graded] = gradeSession(play([[7, 'quiz', true]]));
    expect(graded.wordId).toBe(7);
  });
});

describe('answeredCount', () => {
  it('counts only words that would produce a review', () => {
    const evidence = play([
      [1, 'quiz', true],
      [2, 'spelling', false, { gaveUp: true }],
    ]);

    expect(answeredCount(evidence)).toBe(2);
  });

  it('is zero on an untouched session', () => {
    expect(answeredCount(createEvidence())).toBe(0);
  });
});

describe('gradeSession — personal decks', () => {
  it('uses the grader it is given, so a swipe-only session still rates', () => {
    const evidence = play([
      [1, 'flashcard', true],
      [2, 'flashcard', false],
    ]);

    // The default (course) grader discards self-report entirely.
    expect(gradeSession(evidence)).toEqual([]);

    expect(
      gradeSession(evidence, gradePersonalWord).sort((a, b) => a.wordId - b.wordId),
    ).toEqual([
      { wordId: 1, rating: 'GOOD' },
      { wordId: 2, rating: 'AGAIN' },
    ]);
  });

  it('counts answered words under the personal grader too', () => {
    expect(answeredCount(play([[1, 'flashcard', true]]), gradePersonalWord)).toBe(1);
    expect(answeredCount(play([[1, 'flashcard', true]]))).toBe(0);
  });
});
