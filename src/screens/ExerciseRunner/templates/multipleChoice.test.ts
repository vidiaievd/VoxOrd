import {
  buildMcqAnswer,
  buildMultipleChoiceSubmission,
  extractCorrectOptionIds,
  isMultipleChoiceDocument,
  mcqCanSubmit,
  optionLetter,
  readMultipleChoiceResult,
  readMultipleChoiceSet,
  resumeMultipleChoice,
  type MultipleChoiceSet,
} from './multipleChoice';

/** A projection as content-service sends it: no key, no rules, options already shuffled. */
const projection = {
  instruction: 'Velg det riktige svaret.',
  questions: [
    {
      id: 'q1',
      kind: 'grammar',
      stem: 'Jeg ___ i Norge i tre år.',
      options: [
        { id: 'o1', text: 'har bodd' },
        { id: 'o2', text: 'bodde' },
        { id: 'o3', text: 'bor' },
      ],
    },
    {
      id: 'q2',
      kind: 'reading',
      context: 'Kari jobber på sykehuset.',
      stem: 'Hvor jobber Kari?',
      options: [
        { id: 'o4', text: 'På sykehuset' },
        { id: 'o5', text: 'På skolen' },
      ],
    },
  ],
  settings: { letters: false, layout: 'grid', instant: true, retry: 'none', eliminate: true, progress: false },
};

const setOf = (value: unknown): MultipleChoiceSet => {
  const read = readMultipleChoiceSet(value);
  if (read === null) throw new Error('expected a readable set');
  return read;
};

describe('isMultipleChoiceDocument', () => {
  it('is the new form when `questions` is an array, empty or not', () => {
    expect(isMultipleChoiceDocument({ questions: [] })).toBe(true);
    expect(isMultipleChoiceDocument(projection)).toBe(true);
  });

  // The 121 exercises plan 53 §8 Q2 leaves live. They have no `questions` at all, which
  // is the only tell there can be: they were written before any version field existed.
  it('is the old form for a single-question document', () => {
    expect(isMultipleChoiceDocument({ question: 'Hva?', options: [] })).toBe(false);
    expect(isMultipleChoiceDocument({ questions: 'two' })).toBe(false);
    expect(isMultipleChoiceDocument(null)).toBe(false);
  });
});

describe('readMultipleChoiceSet', () => {
  it('reads the questions and the options in the order they arrived', () => {
    const set = setOf(projection);

    expect(set.instruction).toBe('Velg det riktige svaret.');
    expect(set.questions.map(q => q.id)).toEqual(['q1', 'q2']);
    expect(set.questions[0].options.map(o => o.id)).toEqual(['o1', 'o2', 'o3']);
    expect(set.questions[1].context).toBe('Kari jobber på sykehuset.');
  });

  it('takes the settings the projection sends and defaults the rest', () => {
    expect(setOf(projection).settings).toEqual({
      letters: false,
      layout: 'grid',
      instant: true,
      retry: 'none',
      eliminate: true,
      progress: false,
    });

    expect(setOf({ ...projection, settings: undefined }).settings).toEqual({
      letters: true,
      layout: 'list',
      instant: false,
      retry: 'one',
      eliminate: false,
      progress: true,
    });
  });

  /*
   * The refusals. For this template the content column was built with nothing in it to
   * withhold — which option is right is a map in the other column — so `correct` or `why`
   * arriving at all means the stored document came instead of its projection. Refusing is
   * the point: stripping the key here would leave a runner that works and an exercise
   * whose second try and 50/50 are decoration (plan 53 §6.3).
   */
  it('refuses a document that came with its answer key', () => {
    const withOptionKey = {
      ...projection,
      questions: [
        {
          ...projection.questions[0],
          options: [
            { id: 'o1', text: 'har bodd', correct: true },
            { id: 'o2', text: 'bodde' },
          ],
        },
      ],
    };
    expect(readMultipleChoiceSet(withOptionKey)).toBeNull();
  });

  it('refuses a question carrying the rule behind its answer', () => {
    const withWhy = {
      ...projection,
      questions: [{ ...projection.questions[0], why: 'Presens perfektum.' }],
    };
    expect(readMultipleChoiceSet(withWhy)).toBeNull();
  });

  it('refuses an option carrying its rebuttal', () => {
    const withOptionWhy = {
      ...projection,
      questions: [
        {
          ...projection.questions[0],
          options: [
            { id: 'o1', text: 'har bodd' },
            { id: 'o2', text: 'bodde', why: 'Preteritum er avsluttet.' },
          ],
        },
      ],
    };
    expect(readMultipleChoiceSet(withOptionWhy)).toBeNull();
  });

  // Not a leak but an unanswerable question, and the projection already drops those. One
  // arriving means the two sides disagree about what is deliverable.
  it('refuses a question with fewer than two options', () => {
    const thin = {
      ...projection,
      questions: [{ ...projection.questions[0], options: [{ id: 'o1', text: 'har bodd' }] }],
    };
    expect(readMultipleChoiceSet(thin)).toBeNull();
  });

  it('refuses a question with no stem, and anything that is not a set', () => {
    const stemless = {
      ...projection,
      questions: [{ ...projection.questions[0], stem: '   ' }],
    };
    expect(readMultipleChoiceSet(stemless)).toBeNull();
    expect(readMultipleChoiceSet({ question: 'Hva?' })).toBeNull();
    expect(readMultipleChoiceSet([])).toBeNull();
    expect(readMultipleChoiceSet(null)).toBeNull();
  });

  it('reads an unknown kind as grammar and drops an empty passage', () => {
    const odd = {
      ...projection,
      questions: [{ ...projection.questions[1], kind: 'listening-ish', context: '  ' }],
    };
    const set = setOf(odd);

    expect(set.questions[0].kind).toBe('grammar');
    expect(set.questions[0].context).toBeUndefined();
  });

  it('reads an empty set as empty rather than refusing it', () => {
    expect(setOf({ questions: [] }).questions).toEqual([]);
  });
});

describe('readMultipleChoiceResult', () => {
  // A wrong pick with a try left: the rebuttal comes, the key does not. That withholding
  // is the type — a device holding the key makes the retry and the 50/50 theatre.
  it('reads an open question without the key', () => {
    const result = readMultipleChoiceResult({
      questionId: 'q1',
      optionId: 'o2',
      correct: false,
      attempt: 1,
      attemptsLeft: 1,
      closed: false,
      optionWhy: 'Preteritum er avsluttet.',
      eliminated: ['o3'],
    });

    expect(result).toEqual({
      questionId: 'q1',
      optionId: 'o2',
      correct: false,
      attempt: 1,
      attemptsLeft: 1,
      closed: false,
      optionWhy: 'Preteritum er avsluttet.',
      eliminated: ['o3'],
    });
    expect(result?.keyOptionId).toBeUndefined();
    expect(result?.why).toBeUndefined();
  });

  it('reads a closed question with the key and the rule', () => {
    const result = readMultipleChoiceResult({
      questionId: 'q1',
      optionId: '',
      correct: false,
      attempt: 2,
      attemptsLeft: 0,
      closed: true,
      keyOptionId: 'o1',
      why: 'Presens perfektum om noe som fortsatt varer.',
    });

    expect(result?.closed).toBe(true);
    expect(result?.keyOptionId).toBe('o1');
    expect(result?.why).toBe('Presens perfektum om noe som fortsatt varer.');
  });

  // Guessing `closed` either way would strand the learner on a finished question or offer
  // a try the engine refuses, so a verdict missing it is no verdict.
  it('refuses a verdict that does not say how the question now stands', () => {
    const complete = {
      questionId: 'q1',
      optionId: 'o2',
      correct: false,
      attempt: 1,
      attemptsLeft: 1,
      closed: false,
    };
    expect(readMultipleChoiceResult({ ...complete, closed: undefined })).toBeNull();
    expect(readMultipleChoiceResult({ ...complete, correct: 'no' })).toBeNull();
    expect(readMultipleChoiceResult({ ...complete, questionId: '' })).toBeNull();
    expect(readMultipleChoiceResult({ ...complete, optionId: null })).toBeNull();
    expect(readMultipleChoiceResult(null)).toBeNull();
  });

  it('drops blank prose and non-string eliminations', () => {
    const result = readMultipleChoiceResult({
      questionId: 'q1',
      optionId: 'o1',
      correct: true,
      attempt: 1,
      attemptsLeft: 1,
      closed: true,
      why: '   ',
      eliminated: ['o3', 7],
    });

    expect(result?.why).toBeUndefined();
    expect(result?.eliminated).toEqual(['o3']);
  });
});

describe('resumeMultipleChoice', () => {
  const set = setOf(projection);

  it('plays from the top when nothing has been picked', () => {
    expect(resumeMultipleChoice(set, [])).toEqual({
      index: 0,
      attempt: 1,
      eliminated: [],
      score: 0,
      allClosed: false,
    });
  });

  /*
   * The reason this exists: only a first-attempt hit scores, so a set replayed from the
   * top after the app was killed would hand out a fresh first try at every question — the
   * cheapest possible full mark.
   */
  it('reopens the first unfinished question on the try it had reached', () => {
    const from = resumeMultipleChoice(set, [
      { questionId: 'q1', picks: ['o1'], eliminated: [], correct: true, closed: true, revealed: false },
      { questionId: 'q2', picks: ['o5'], eliminated: ['o5'], correct: false, closed: false, revealed: false },
    ]);

    expect(from).toEqual({
      index: 1,
      attempt: 2,
      eliminated: ['o5'],
      score: 1,
      allClosed: false,
    });
  });

  it('counts only questions taken on the first pick', () => {
    const from = resumeMultipleChoice(set, [
      { questionId: 'q1', picks: ['o2', 'o1'], eliminated: [], correct: true, closed: true, revealed: false },
      { questionId: 'q2', picks: ['o4'], eliminated: [], correct: true, closed: true, revealed: false },
    ]);

    expect(from.score).toBe(1);
    expect(from.allClosed).toBe(true);
    expect(from.index).toBe(1);
  });

  // A document can be edited between sittings, and a question that no longer exists is
  // not one to walk back to — nor to count.
  it('drops picks at questions the set no longer holds', () => {
    const from = resumeMultipleChoice(set, [
      { questionId: 'gone', picks: ['x'], eliminated: [], correct: true, closed: true, revealed: false },
    ]);

    expect(from).toEqual({
      index: 0,
      attempt: 1,
      eliminated: [],
      score: 0,
      allClosed: false,
    });
  });
});

/**
 * Empty on purpose, and not a shortcut: the engine throws away whatever arrives and
 * rebuilds the list from the picks it recorded, because which try a question was taken on
 * is the score (plan 53 §5).
 */
describe('buildMultipleChoiceSubmission', () => {
  it('closes the attempt with nothing the client could get wrong', () => {
    expect(buildMultipleChoiceSubmission()).toEqual({ answers: [] });
  });
});

describe('optionLetter', () => {
  it('badges A–H and falls back to the position after that', () => {
    expect(optionLetter(0)).toBe('A');
    expect(optionLetter(7)).toBe('H');
    expect(optionLetter(8)).toBe('9');
  });
});

/* ── The old form, untouched ─────────────────────────────────────────────── */

describe('buildMcqAnswer', () => {
  it('wraps the selected id in correct_option_ids', () => {
    expect(buildMcqAnswer('b')).toEqual({ correct_option_ids: ['b'] });
  });

  it('returns null when nothing is selected', () => {
    expect(buildMcqAnswer(null)).toBeNull();
  });
});

describe('mcqCanSubmit', () => {
  it('is true once an option is selected', () => {
    expect(mcqCanSubmit('a')).toBe(true);
  });

  it('is false with no selection', () => {
    expect(mcqCanSubmit(null)).toBe(false);
  });
});

describe('extractCorrectOptionIds', () => {
  it('reads correct_option_ids from a well-formed correctAnswer', () => {
    expect(extractCorrectOptionIds({ correct_option_ids: ['b'], explanation: 'x' })).toEqual([
      'b',
    ]);
  });

  it('returns null for missing/malformed shapes', () => {
    expect(extractCorrectOptionIds(null)).toBeNull();
    expect(extractCorrectOptionIds(undefined)).toBeNull();
    expect(extractCorrectOptionIds('b')).toBeNull();
    expect(extractCorrectOptionIds({ correct_option_ids: 'b' })).toBeNull();
    expect(extractCorrectOptionIds({})).toBeNull();
  });
});
