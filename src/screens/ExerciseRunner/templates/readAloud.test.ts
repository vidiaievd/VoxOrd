import type { AttemptRow } from '../../../api/exercises';
import type { MediaAsset } from '../../../api/media';
import {
  openingOf,
  outcomeOf,
  readDecisions,
  readReadAloudContent,
  recordingFilename,
  recordingRefusal,
  verifiedDraft,
} from './readAloud';

const PROJECTION = {
  title: 'Les høyt',
  instruction: 'Les teksten høyt.',
  language: 'nb',
  mode: 'read',
  prompts: [
    {
      id: 'p1',
      label: 'Avsnitt 1',
      minSeconds: 10,
      maxSeconds: 40,
      prepSeconds: 20,
      text: 'Jeg heter Kari.',
    },
  ],
  recording: {
    takes: 2,
    chooseBest: true,
    listenBack: true,
    countdown: true,
    micCheck: false,
    keepAllTakes: false,
  },
  settings: {
    showRubric: 'afterGraded',
    showModel: 'afterGraded',
    revision: 'return',
  },
};

describe('readReadAloudContent', () => {
  it('reads the student projection', () => {
    const c = readReadAloudContent(PROJECTION);
    expect(c?.mode).toBe('read');
    expect(c?.prompts[0]).toEqual({
      id: 'p1',
      label: 'Avsnitt 1',
      minSeconds: 10,
      maxSeconds: 40,
      prepSeconds: 20,
      text: 'Jeg heter Kari.',
    });
    expect(c?.recording.takes).toBe(2);
    expect(c?.recording.micCheck).toBe(false);
  });

  it('reads the carried prompts and ignores entries the exercise does not have (phase 11b)', () => {
    const c = readReadAloudContent({
      ...PROJECTION,
      carried: [
        { itemId: 'p1', attempt: 1 },
        { itemId: 'gone', attempt: 1 },
        { itemId: 'p1', attempt: 0 },
      ],
    });
    expect(c?.carried).toEqual([{ itemId: 'p1', attempt: 1 }]);
    expect(readReadAloudContent(PROJECTION)?.carried).toBeUndefined();
  });

  it('refuses a document carrying the key — never strips it (RA-M5)', () => {
    expect(readReadAloudContent({ ...PROJECTION, review: {} })).toBeNull();
    expect(
      readReadAloudContent({
        ...PROJECTION,
        prompts: [{ ...PROJECTION.prompts[0], note: 'listen for /ç/' }],
      }),
    ).toBeNull();
    expect(
      readReadAloudContent({
        ...PROJECTION,
        settings: { ...PROJECTION.settings, passScore: 9 },
      }),
    ).toBeNull();
  });

  it('takes a rubric only under showRubric: always, and only without weights', () => {
    const rubric = [
      { id: 'c1', name: 'Uttale', desc: '', levels: ['a', 'b', 'c', 'd'] },
    ];
    expect(readReadAloudContent({ ...PROJECTION, rubric })).toBeNull();
    const always = {
      ...PROJECTION,
      settings: { ...PROJECTION.settings, showRubric: 'always' },
    };
    expect(readReadAloudContent({ ...always, rubric })?.rubric).toHaveLength(1);
    expect(
      readReadAloudContent({
        ...always,
        rubric: [{ ...rubric[0], weight: 2 }],
      }),
    ).toBeNull();
  });
});

const row = (over: Partial<AttemptRow>): AttemptRow => ({
  id: 'a',
  status: 'IN_PROGRESS',
  templateCode: 'read_aloud',
  submittedAnswer: null,
  draftAnswer: null,
  ...over,
});

const SUBMITTED = {
  recordings: [{ itemId: 'p1', assetId: 'x1', seconds: 12, takes: 1 }],
};
const DRAFT = {
  takes: { p1: [{ n: 1, assetId: 'd1', seconds: 12 }] },
  chosen: {},
};

describe('openingOf', () => {
  it('opens on the teacher when work is waiting', () => {
    expect(
      openingOf(
        [
          row({
            id: 's',
            status: 'ROUTED_FOR_REVIEW',
            submittedAnswer: SUBMITTED,
          }),
        ],
        'return',
      ),
    ).toEqual({
      stage: 'sent',
      attemptId: 's',
      recordings: SUBMITTED.recordings,
    });
  });

  it('puts takes on a draft ahead of a verdict', () => {
    const rows = [
      row({ id: 'o', draftAnswer: DRAFT }),
      row({ id: 'g', status: 'RETURNED', submittedAnswer: SUBMITTED }),
    ];
    expect(openingOf(rows, 'return')).toMatchObject({
      stage: 'draft',
      attemptId: 'o',
    });
  });

  it('offers a redo only for returned work under revision: return', () => {
    const returned = [
      row({ id: 'g', status: 'RETURNED', submittedAnswer: SUBMITTED }),
    ];
    expect(openingOf(returned, 'return')).toMatchObject({
      stage: 'graded',
      redo: true,
    });
    expect(openingOf(returned, 'once')).toMatchObject({
      stage: 'graded',
      redo: false,
    });
    const scored = [
      row({ id: 'g', status: 'SCORED', submittedAnswer: SUBMITTED }),
    ];
    expect(openingOf(scored, 'return')).toMatchObject({
      stage: 'graded',
      redo: false,
    });
  });

  it('starts fresh with nothing, an empty open attempt, or only abandoned ones', () => {
    expect(openingOf([], 'return')).toEqual({ stage: 'fresh' });
    expect(openingOf([row({})], 'return')).toEqual({ stage: 'fresh' });
    expect(openingOf([row({ status: 'ABANDONED' })], 'return')).toEqual({
      stage: 'fresh',
    });
  });
});

describe('verifiedDraft', () => {
  const asset = (over: Partial<MediaAsset>): MediaAsset => ({
    id: 'x',
    mimeType: 'audio/mp4',
    url: 'http://minio/x',
    status: 'READY',
    entityId: 'att',
    ...over,
  });

  it('keeps takes of this attempt still in storage, renumbered, with the pick following', () => {
    const draft = {
      takes: {
        p1: [
          { n: 1, assetId: 'gone', seconds: 10 },
          { n: 2, assetId: 'other', seconds: 11 },
          { n: 3, assetId: 'ok', seconds: 12 },
        ],
      },
      chosen: { p1: 2 },
    };
    const assets = new Map<string, MediaAsset | null>([
      ['gone', null],
      ['other', asset({ entityId: 'another-attempt' })],
      ['ok', asset({})],
    ]);
    expect(verifiedDraft(draft, 'att', assets)).toEqual({
      takes: { p1: [{ n: 1, assetId: 'ok', seconds: 12 }] },
      chosen: { p1: 0 },
    });
  });

  it('drops failed and deleted recordings', () => {
    const assets = new Map<string, MediaAsset | null>([
      ['d1', asset({ status: 'FAILED' })],
    ]);
    expect(verifiedDraft(DRAFT, 'att', assets)).toEqual({
      takes: {},
      chosen: {},
    });
  });
});

describe('recordingRefusal', () => {
  it('reads the engine 422 with its prompts', () => {
    expect(
      recordingRefusal(422, {
        code: 'RA_RECORDING_LENGTH',
        message: 'x',
        itemIds: ['p1', 3],
      }),
    ).toEqual({ code: 'RA_RECORDING_LENGTH', itemIds: ['p1'] });
  });

  it('is not one for other codes or statuses', () => {
    expect(recordingRefusal(422, { code: 'RUBRIC_INCOMPLETE' })).toBeNull();
    expect(recordingRefusal(503, { code: 'RA_RECORDING_LENGTH' })).toBeNull();
    expect(recordingRefusal(422, 'oops')).toBeNull();
  });
});

it('names a take file by prompt and number', () => {
  expect(recordingFilename('p1', 2, 'audio/mp4')).toBe('p1-take-2.m4a');
});

describe('the graded verdict', () => {
  it("carries the teacher's marks, decisions and comment into the graded opening", () => {
    const rows = [
      row({
        id: 'g',
        status: 'RETURNED',
        submittedAnswer: SUBMITTED,
        passed: false,
        rubricMarks: { 'p1:c1': 1 },
        rubricSnapshot: { criteria: [], passScore: 9 },
        reviewDecisions: [
          { itemId: 'p1', approved: false, comment: 'Øv på r-en.' },
          { bad: true },
        ],
        reviewComment: null,
      }),
    ];
    expect(openingOf(rows, 'return')).toMatchObject({
      stage: 'graded',
      redo: true,
      verdict: {
        passed: false,
        marks: { 'p1:c1': 1 },
        decisions: [{ itemId: 'p1', approved: false, comment: 'Øv på r-en.' }],
        comment: null,
      },
    });
  });

  it('labels the outcome by the verdict and the revision policy', () => {
    expect(outcomeOf(true, 'return')).toBe('passed');
    expect(outcomeOf(false, 'return')).toBe('rewrite');
    expect(outcomeOf(false, 'once')).toBe('failed');
    expect(outcomeOf(null, 'return')).toBe('rewrite');
  });

  it('reads decisions and drops malformed ones', () => {
    expect(readDecisions('x')).toEqual([]);
    expect(
      readDecisions([{ itemId: 'p1', approved: true }, { itemId: 'p2' }]),
    ).toEqual([{ itemId: 'p1', approved: true }]);
  });
});
