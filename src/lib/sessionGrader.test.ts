import {
  gradePersonalWord,
  gradeWord,
  recordAttempt,
  type ModeOutcome,
  type SessionMode,
} from './sessionGrader';

/** Builds an outcome directly, for tests that assert on the decision table. */
function outcome(mode: SessionMode, over: Partial<ModeOutcome> = {}): ModeOutcome {
  return {
    mode,
    failedAttempts: 0,
    eventuallyCorrect: true,
    hintUsed: false,
    gaveUp: false,
    typoed: false,
    ...over,
  };
}

/** Feeds a sequence of answers through the accumulator, as a session would. */
function play(steps: Array<[SessionMode, boolean] | [SessionMode, boolean, object]>): ModeOutcome[] {
  return steps.reduce<ModeOutcome[]>(
    (acc, [mode, correct, extra = {}]) =>
      recordAttempt(acc, mode as SessionMode, { correct: correct as boolean, ...extra }),
    [],
  );
}

describe('recordAttempt', () => {
  it('records a first-try success as zero failures', () => {
    expect(play([['quiz', true]])).toEqual([
      {
        mode: 'quiz',
        failedAttempts: 0,
        eventuallyCorrect: true,
        hintUsed: false,
        gaveUp: false,
        typoed: false,
      },
    ]);
  });

  it('accumulates retries within one mode instead of creating separate outcomes', () => {
    const result = play([
      ['spelling', false],
      ['spelling', false],
      ['spelling', true],
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ failedAttempts: 2, eventuallyCorrect: true });
  });

  it('keeps modes separate', () => {
    const result = play([
      ['quiz', true],
      ['spelling', false],
    ]);
    expect(result.map((o) => o.mode)).toEqual(['quiz', 'spelling']);
  });

  it('does not let a later wrong answer un-earn an earlier success', () => {
    const result = play([
      ['quiz', true],
      ['quiz', false],
    ]);
    expect(result[0].eventuallyCorrect).toBe(true);
    expect(result[0].failedAttempts).toBe(1);
  });

  it('latches hintUsed and gaveUp once set', () => {
    const result = play([
      ['spelling', false, { hintUsed: true }],
      ['spelling', true],
    ]);
    expect(result[0].hintUsed).toBe(true);
  });
});

describe('gradeWord — insufficient evidence', () => {
  it('returns null when nothing was attempted', () => {
    expect(gradeWord([])).toBeNull();
  });

  it('returns null for a mode presented but never answered', () => {
    // Abandoned mid-question: no failures, no success, no skip.
    expect(
      gradeWord([outcome('quiz', { eventuallyCorrect: false, failedAttempts: 0 })]),
    ).toBeNull();
  });
});

describe('gradeWord — AGAIN', () => {
  it('when the user gave up', () => {
    expect(
      gradeWord([outcome('quiz'), outcome('spelling', { gaveUp: true, eventuallyCorrect: false })]),
    ).toBe('AGAIN');
  });

  it('when a 4-way recognition choice was missed', () => {
    expect(gradeWord([outcome('quiz', { failedAttempts: 1 })])).toBe('AGAIN');
  });

  it('when listening was missed even though spelling was perfect', () => {
    // Rule 2 outranks a flawless production result: missing the easiest test
    // means the word is not known.
    expect(gradeWord([outcome('listening', { failedAttempts: 1 }), outcome('spelling')])).toBe(
      'AGAIN',
    );
  });

  it('when spelling failed twice before succeeding', () => {
    expect(gradeWord([outcome('quiz'), outcome('spelling', { failedAttempts: 2 })])).toBe('AGAIN');
  });

  it('when spelling was never produced correctly', () => {
    expect(
      gradeWord([
        outcome('quiz'),
        outcome('spelling', { failedAttempts: 1, eventuallyCorrect: false }),
      ]),
    ).toBe('AGAIN');
  });
});

describe('gradeWord — HARD', () => {
  it('when the target form was missed in context but recognition was clean', () => {
    expect(gradeWord([outcome('quiz'), outcome('context', { failedAttempts: 1 })])).toBe('HARD');
  });

  it('when spelling needed the hint', () => {
    expect(gradeWord([outcome('quiz'), outcome('spelling', { hintUsed: true })])).toBe('HARD');
  });

  it('when spelling took exactly one retry', () => {
    expect(gradeWord([outcome('quiz'), outcome('spelling', { failedAttempts: 1 })])).toBe('HARD');
  });

  it('when spelling was accepted as a near-miss', () => {
    // A slipped keystroke is not a lapse: recall was there, production was
    // imperfect. Without this the grader's rule 3 would reset the schedule of a
    // word the user actually knows.
    expect(gradeWord([outcome('quiz'), outcome('spelling', { typoed: true })])).toBe('HARD');
  });

  it('when a typo is followed by a clean retry in the same mode', () => {
    const outcomes = play([
      ['quiz', true],
      ['spelling', true, { typo: true }],
    ]);
    expect(gradeWord(outcomes)).toBe('HARD');
  });

  it('receptive-but-not-productive is HARD, not a lapse', () => {
    const outcomes = play([
      ['quiz', true],
      ['listening', true],
      ['spelling', false],
      ['spelling', true],
    ]);
    expect(gradeWord(outcomes)).toBe('HARD');
  });
});

describe('gradeWord — EASY', () => {
  it('when every mode including spelling was first-try and unaided', () => {
    expect(
      gradeWord([outcome('quiz'), outcome('listening'), outcome('context'), outcome('spelling')]),
    ).toBe('EASY');
  });

  it('is never awarded without production evidence', () => {
    // Perfect recognition only — EASY jumps ~8 days and skips learning, so it
    // requires the hardest mode.
    expect(gradeWord([outcome('quiz'), outcome('listening'), outcome('context')])).toBe('GOOD');
  });

  it('is not awarded after a near-miss, even if first-try accepted', () => {
    expect(
      gradeWord([outcome('quiz'), outcome('spelling', { typoed: true })]),
    ).toBe('HARD');
  });

  it('is not awarded when the hint was shown, even if first-try correct', () => {
    // hintMode 'always' can show the hint without any mistake being made.
    expect(gradeWord([outcome('quiz'), outcome('spelling', { hintUsed: true })])).toBe('HARD');
  });
});

describe('gradeWord — GOOD', () => {
  it('for a clean recognition-only session', () => {
    expect(gradeWord([outcome('quiz')])).toBe('GOOD');
  });

  it('for an abandoned session capped below EASY', () => {
    // Only recognition ran before the user quit: no spelling evidence, so the
    // best attainable rating is GOOD and the work is not lost.
    const outcomes = play([
      ['listening', true],
      ['quiz', true],
    ]);
    expect(gradeWord(outcomes)).toBe('GOOD');
  });
});

describe('gradeWord — end-to-end sequences', () => {
  it('grades a flawless full drill as EASY', () => {
    const outcomes = play([
      ['listening', true],
      ['quiz', true],
      ['context', true],
      ['spelling', true],
    ]);
    expect(gradeWord(outcomes)).toBe('EASY');
  });

  it('grades a give-up as AGAIN regardless of earlier successes', () => {
    const outcomes = play([
      ['listening', true],
      ['quiz', true],
      ['context', true],
      ['spelling', false, { hintUsed: true }],
      ['spelling', false, { gaveUp: true }],
    ]);
    expect(gradeWord(outcomes)).toBe('AGAIN');
  });
});

describe('gradeWord — self-report is not measured performance', () => {
  it('ignores a flashcard outcome entirely', () => {
    expect(gradeWord(play([['flashcard', true]]))).toBeNull();
    expect(gradeWord(play([['flashcard', false]]))).toBeNull();
  });

  it('does not let a swiped-away card drag a measured session down', () => {
    // Without the filter, rule 6's "every mode first-try" would fail here and
    // the flawless spelling result would silently degrade from EASY to GOOD.
    const outcomes = play([
      ['flashcard', false],
      ['quiz', true],
      ['spelling', true],
    ]);
    expect(gradeWord(outcomes)).toBe('EASY');
  });
});

describe('gradePersonalWord', () => {
  it('matches gradeWord whenever measured evidence exists', () => {
    const cases: ModeOutcome[][] = [
      play([['quiz', true]]),
      play([['quiz', false], ['quiz', true]]),
      play([['context', false], ['context', true]]),
      play([['spelling', true, { hintUsed: true }]]),
      play([['quiz', true], ['spelling', true]]),
      play([['spelling', false, { gaveUp: true }]]),
    ];

    for (const outcomes of cases) {
      expect(gradePersonalWord(outcomes)).toBe(gradeWord(outcomes));
    }
  });

  it('lets measured evidence override a contradicting swipe', () => {
    // Deep Session opens with flashcards over the same words it then tests.
    expect(gradePersonalWord(play([['flashcard', true], ['quiz', false], ['quiz', true]])))
      .toBe('AGAIN');
    expect(gradePersonalWord(play([['flashcard', false], ['quiz', true]])))
      .toBe('GOOD');
  });

  it('keeps EASY reachable in a session that opened with flashcards', () => {
    const outcomes = play([
      ['flashcard', true],
      ['listening', true],
      ['quiz', true],
      ['spelling', true],
    ]);
    expect(gradePersonalWord(outcomes)).toBe('EASY');
  });

  it('grades a flashcard-only session at GOOD, never EASY', () => {
    expect(gradePersonalWord(play([['flashcard', true]]))).toBe('GOOD');
  });

  it('takes an admitted miss at face value', () => {
    expect(gradePersonalWord(play([['flashcard', false]]))).toBe('AGAIN');
  });

  it('lets one admitted miss outweigh a later claim of knowing', () => {
    expect(gradePersonalWord(play([['flashcard', false], ['flashcard', true]])))
      .toBe('AGAIN');
  });

  it('returns null for an untouched word, leaving it due', () => {
    expect(gradePersonalWord([])).toBeNull();
  });

  it('returns null when a mode was presented but never answered', () => {
    expect(gradePersonalWord([outcome('flashcard', { eventuallyCorrect: false })])).toBeNull();
  });
});
