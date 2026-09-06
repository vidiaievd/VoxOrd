import {
  buildShortAnswerAnswer,
  buildShortAnswerSubmission,
  canHandIn,
  countVerdict,
  EMPTY_TALLY,
  extractReferenceAnswer,
  isShortAnswerDocument,
  readShortAnswerResult,
  readShortAnswerSet,
  readVerdict,
  shortAnswerCanSubmit,
} from './shortAnswer';

/** A minimal projection, as content-service's `studentSafeContent` sends it. */
const projection = (over: Record<string, unknown> = {}): unknown => ({
  instruction: 'Svar med én til tre setninger.',
  questions: [
    { id: 'q1', kind: 'reading', passage: 'Kari flyttet til Bergen.', prompt: 'Hvor flyttet Kari?' },
    { id: 'q2', kind: 'opinion', prompt: 'Hva mener du om det?' },
  ],
  settings: { minWords: 4, teacherReview: 'all' },
  ...over,
});

describe('isShortAnswerDocument', () => {
  it('is the new form when `questions` is an array, empty or not', () => {
    expect(isShortAnswerDocument({ questions: [] })).toBe(true);
    expect(isShortAnswerDocument(projection())).toBe(true);
  });

  it('is the old form for a single-question document', () => {
    expect(isShortAnswerDocument({ question: 'Hvor bor hun?' })).toBe(false);
    expect(isShortAnswerDocument(null)).toBe(false);
    expect(isShortAnswerDocument('questions')).toBe(false);
  });
});

describe('readShortAnswerSet', () => {
  it('reads a projection and fills the settings from the kernel defaults', () => {
    const set = readShortAnswerSet(projection())!;

    expect(set.questions.map(q => q.id)).toEqual(['q1', 'q2']);
    expect(set.questions[0].passage).toBe('Kari flyttet til Bergen.');
    expect(set.questions[1].kind).toBe('opinion');
    expect(set.settings.minWords).toBe(4);
    expect(set.settings.teacherReview).toBe('all');
    // Untouched by the wire object, so the author's own default stands.
    expect(set.settings.showModel).toBe('onClose');
    expect(set.settings.showBreakdown).toBe(true);
    expect(set.settings.passRule).toBe('all');
  });

  it('defaults an unknown kind to `reading` rather than refusing the question', () => {
    const set = readShortAnswerSet(
      projection({ questions: [{ id: 'q1', kind: 'dictation', prompt: 'Hvor?' }] }),
    )!;
    expect(set.questions[0].kind).toBe('reading');
  });

  it('refuses a set that still carries the answer key', () => {
    expect(
      readShortAnswerSet(
        projection({
          questions: [
            { id: 'q1', prompt: 'Hvor?', elements: [{ id: 'e1', label: 'Bergen', anchors: ['bergen'] }] },
          ],
        }),
      ),
    ).toBeNull();

    expect(
      readShortAnswerSet(
        projection({ questions: [{ id: 'q1', prompt: 'Hvor?', why: 'Teksten sier Bergen.' }] }),
      ),
    ).toBeNull();
  });

  it('refuses a model answer that arrives before it was earned', () => {
    const early = projection({
      questions: [{ id: 'q1', prompt: 'Hvor?', model: 'Hun flyttet til Bergen.' }],
      settings: { showModel: 'onClose' },
    });
    expect(readShortAnswerSet(early)).toBeNull();
  });

  it('keeps the model answer under `showModel: always` — the one case it may come early', () => {
    const allowed = projection({
      questions: [{ id: 'q1', prompt: 'Hvor?', model: 'Hun flyttet til Bergen.' }],
      settings: { showModel: 'always' },
    });
    expect(readShortAnswerSet(allowed)!.questions[0].model).toBe('Hun flyttet til Bergen.');
  });

  it('refuses a question with no id or no prompt, and anything that is not a set', () => {
    expect(readShortAnswerSet(projection({ questions: [{ id: '', prompt: 'Hvor?' }] }))).toBeNull();
    expect(readShortAnswerSet(projection({ questions: [{ id: 'q1', prompt: '  ' }] }))).toBeNull();
    expect(readShortAnswerSet({ question: 'Hvor bor hun?' })).toBeNull();
    expect(readShortAnswerSet(null)).toBeNull();
  });
});

describe('readShortAnswerResult', () => {
  const result = {
    questionId: 'q1',
    verdict: 'partial',
    covered: 1,
    total: 2,
    tooShort: false,
    hits: [
      { id: 'e1', label: 'Byen', required: true, hit: true },
      { id: 'e2', label: 'Grunnen', required: true, hit: false },
      'not a hit',
    ],
    why: 'Svaret nevner byen, men ikke grunnen.',
  };

  it('reads the server verdict as sent', () => {
    const read = readShortAnswerResult(result)!;
    expect(read.verdict).toBe('partial');
    expect(read.covered).toBe(1);
    expect(read.hits.map(h => h.id)).toEqual(['e1', 'e2']);
    expect(read.model).toBeUndefined();
  });

  it('carries the model answer only when the server sent one', () => {
    expect(readShortAnswerResult({ ...result, model: 'Til Bergen, for jobben.' })!.model).toBe(
      'Til Bergen, for jobben.',
    );
    expect(readShortAnswerResult({ ...result, model: '   ' })!.model).toBeUndefined();
  });

  it('refuses a result with no verdict — a coverage line built from nothing would lie', () => {
    expect(readShortAnswerResult({ ...result, verdict: 'ok' })).toBeNull();
    expect(readShortAnswerResult({ ...result, questionId: '' })).toBeNull();
    expect(readShortAnswerResult(null)).toBeNull();
  });
});

describe('countVerdict', () => {
  it('tallies each verdict on its own count', () => {
    const tally = countVerdict(countVerdict(EMPTY_TALLY, 'pass'), 'fail');
    expect(tally).toEqual({ pass: 1, partial: 0, fail: 1 });
  });

  it('never mutates the tally it was given', () => {
    countVerdict(EMPTY_TALLY, 'pass');
    expect(EMPTY_TALLY).toEqual({ pass: 0, partial: 0, fail: 0 });
  });
});

describe('readVerdict', () => {
  it('accepts the three verdicts the engine speaks', () => {
    expect(readVerdict('pass')).toBe('pass');
    expect(readVerdict('partial')).toBe('partial');
    expect(readVerdict('fail')).toBe('fail');
  });

  // A resumed attempt reads its verdicts back as bare strings, and a word this runner
  // does not know must not be counted into the tally (plan 51 §8 Q6).
  it('refuses anything else', () => {
    expect(readVerdict('auto')).toBeNull();
    expect(readVerdict(undefined)).toBeNull();
    expect(readVerdict(1)).toBeNull();
  });
});

describe('canHandIn', () => {
  it('needs something written', () => {
    expect(canHandIn('Til Bergen.')).toBe(true);
    expect(canHandIn('   ')).toBe(false);
  });
});

describe('buildShortAnswerSubmission', () => {
  it('carries every answer in order, and no verdict with them', () => {
    expect(
      buildShortAnswerSubmission([
        { questionId: 'q1', text: 'Til Bergen.' },
        { questionId: 'q2', text: 'Jeg synes det er lurt.' },
      ]),
    ).toEqual({
      answers: [
        { questionId: 'q1', text: 'Til Bergen.' },
        { questionId: 'q2', text: 'Jeg synes det er lurt.' },
      ],
    });
  });
});

/* The old form — 144 exercises still written this way (plan 51 §8 Q1). */

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
