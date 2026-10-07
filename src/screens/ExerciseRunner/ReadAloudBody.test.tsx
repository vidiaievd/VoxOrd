import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../../api/client';
import type { ExerciseDisplay } from '../../api/types';
import { createMockRecorder, type MockRecorder } from '../../services/recorder';
import type { ExerciseBodyProps } from './ExerciseBody';
import { ReadAloudBody } from './ReadAloudBody';

/**
 * The body is the whole solver on the phone — the card, the recorder, the uploads, the draft,
 * the hand-in and what follows it — so its rules are tested here against a mock microphone and
 * mocked services, the way the web tests `read-aloud-solver.tsx`.
 */

const mockRecentAttempts = jest.fn();
const mockSaveDraft = jest.fn();
const mockGetAttempt = jest.fn();
const mockGetMediaAsset = jest.fn();
const mockUploadRecording = jest.fn();
const mockDeleteMediaAsset = jest.fn();

jest.mock('../../api/exercises', () => ({
  recentAttempts: (...a: unknown[]) => mockRecentAttempts(...a),
  saveDraft: (...a: unknown[]) => mockSaveDraft(...a),
  getAttempt: (...a: unknown[]) => mockGetAttempt(...a),
}));

jest.mock('../../api/media', () => ({
  getMediaAsset: (...a: unknown[]) => mockGetMediaAsset(...a),
  uploadRecording: (...a: unknown[]) => mockUploadRecording(...a),
  deleteMediaAsset: (...a: unknown[]) => mockDeleteMediaAsset(...a),
}));

jest.mock('react-native-sound', () => {
  function Sound() {}
  Sound.setCategory = () => undefined;
  return Sound;
});

jest.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars === undefined ? key : `${key} ${JSON.stringify(vars)}`,
    language: 'en',
  }),
}));

jest.mock('../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    colors: jest.requireActual('../../theme/colors').lightColors,
  }),
}));

jest.mock('../../hooks/useExerciseAudio', () => ({
  useExerciseAudio: () => ({
    audio: {
      enabled: false,
      settings: { layout: 'top', transcriptWhen: 'never' },
    },
    segments: {},
    gated: false,
  }),
}));

jest.mock('./audio', () => ({
  ExerciseAudioPlayer: () => null,
}));

const content = (recording: Record<string, unknown> = {}) => ({
  title: 'Les høyt',
  instruction: 'Les teksten høyt.',
  language: 'nb',
  mode: 'read',
  prompts: [
    {
      id: 'p1',
      label: 'Avsnitt 1',
      minSeconds: 5,
      maxSeconds: 30,
      prepSeconds: 0,
      text: 'Jeg heter Kari.',
    },
  ],
  recording: {
    takes: 2,
    chooseBest: true,
    listenBack: true,
    countdown: false,
    micCheck: false,
    keepAllTakes: false,
    ...recording,
  },
  settings: {
    showRubric: 'afterGraded',
    showModel: 'afterGraded',
    revision: 'return',
  },
});

const display = (recording?: Record<string, unknown>): ExerciseDisplay =>
  ({
    id: 'ex-1',
    templateCode: 'read_aloud',
    targetLanguage: 'nb',
    content: content(recording),
    instructions: [],
  } as unknown as ExerciseDisplay);

async function mount({
  recording,
  overrides = {},
}: {
  recording?: Record<string, unknown>;
  overrides?: Partial<ExerciseBodyProps>;
} = {}) {
  const mic: MockRecorder = createMockRecorder();
  const checkTable = jest.fn();
  const finishTable = jest.fn();
  const openAttempt = jest.fn().mockResolvedValue('att-1');
  const props: ExerciseBodyProps = {
    display: display(recording),
    phase: 'answering',
    disabled: false,
    verdict: null,
    onAnswerChange: jest.fn(),
    answerQuestion: jest.fn(),
    checkRow: jest.fn(),
    checkTable,
    finishTable,
    openAttempt,
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <ReadAloudBody {...props} createPort={() => mic} />,
    );
  });
  const root = renderer.root;

  const texts = () =>
    root
      .findAllByType(Text)
      .map(t => [t.props.children].flat().join(''))
      .join('\n');
  const button = (key: string) =>
    root
      .findAllByType(TouchableOpacity)
      .find(b =>
        b
          .findAllByType(Text)
          .some(t => [t.props.children].flat().join('').includes(key)),
      );
  const press = async (key: string) => {
    const b = button(key);
    if (b === undefined) throw new Error(`No button ${key}\n${texts()}`);
    await act(async () => {
      await b.props.onPress();
    });
  };
  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  return {
    mic,
    checkTable,
    finishTable,
    openAttempt,
    texts,
    button,
    press,
    flush,
    renderer,
  };
}

/** Begin, stop, let the adapter answer. */
async function recordTake(
  m: Awaited<ReturnType<typeof mount>>,
  key = 'readAloud.start',
) {
  await m.press(key);
  await m.flush();
  expect(m.mic.recording).toBe(true);
  await m.press('readAloud.rec.stop');
  await m.flush();
}

beforeEach(() => {
  jest.useFakeTimers();
  mockRecentAttempts.mockReset().mockResolvedValue([]);
  mockSaveDraft.mockReset().mockResolvedValue({ savedAt: 'now' });
  mockGetAttempt.mockReset();
  mockGetMediaAsset.mockReset().mockResolvedValue({
    id: 'x',
    mimeType: 'audio/mp4',
    url: 'u',
    peaks: null,
  });
  mockUploadRecording.mockReset().mockResolvedValue({ assetId: 'asset-1' });
  mockDeleteMediaAsset.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ReadAloudBody', () => {
  it('opens on the card and creates no attempt until Start', async () => {
    const m = await mount();
    expect(m.texts()).toContain('readAloud.card.start');
    expect(m.openAttempt).not.toHaveBeenCalled();
    expect(m.mic.calls).toEqual([]);
  });

  it('records, uploads onto the attempt, keeps the draft, and hands in to the teacher', async () => {
    const m = await mount();
    await m.press('readAloud.card.start');
    expect(m.openAttempt).toHaveBeenCalledTimes(1);

    await recordTake(m);
    expect(mockUploadRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/cache/take-1.m4a',
        mimeType: 'audio/mp4',
        attemptId: 'att-1',
        filename: 'p1-take-1.m4a',
      }),
    );
    await m.flush();
    expect(mockSaveDraft).toHaveBeenLastCalledWith('ex-1', 'att-1', {
      takes: { p1: [{ n: 1, assetId: 'asset-1', seconds: 20 }] },
      chosen: { p1: 0 },
    });

    const verdict = {
      attemptId: 'att-1',
      correct: false,
      score: null,
      requiresReview: true,
      feedback: { summary: '' },
    };
    m.checkTable.mockResolvedValue(verdict);
    await m.press('readAloud.submit');
    expect(m.checkTable).toHaveBeenCalledWith({
      recordings: [{ itemId: 'p1', assetId: 'asset-1', seconds: 20, takes: 1 }],
    });
    expect(m.finishTable).toHaveBeenCalledWith(verdict);
    expect(m.texts()).toContain('readAloud.sentTitle');
  });

  it('records only the prompts still to do and lists the carried ones (plan 70, phase 11b)', async () => {
    const base = content();
    const withCarried = {
      ...display(),
      content: {
        ...base,
        prompts: [
          {
            id: 'p0',
            label: 'Avsnitt 0',
            minSeconds: 5,
            maxSeconds: 30,
            prepSeconds: 0,
            text: 'Hei.',
          },
          ...base.prompts,
        ],
        carried: [{ itemId: 'p0', attempt: 1 }],
      },
    } as unknown as ExerciseDisplay;
    const m = await mount({ overrides: { display: withCarried } });
    await m.press('readAloud.card.start');

    expect(m.texts()).toContain('readAloud.carried.title {"count":1}');
    expect(m.texts()).toContain('readAloud.carried.inAttempt {"attempt":1}');
    expect(m.texts()).toContain('readAloud.progress {"n":1,"total":1}');

    await recordTake(m);
    m.checkTable.mockResolvedValue({
      attemptId: 'att-1',
      correct: false,
      score: null,
      requiresReview: true,
      feedback: { summary: '' },
    });
    await m.press('readAloud.submit');
    expect(m.checkTable).toHaveBeenCalledWith({
      recordings: [{ itemId: 'p1', assetId: 'asset-1', seconds: 20, takes: 1 }],
    });
  });

  it('keeps the hand-in off while a take is short, and says which', async () => {
    const m = await mount();
    await m.press('readAloud.card.start');
    m.mic.seconds = 3;
    await recordTake(m);
    await m.flush();
    expect(m.texts()).toContain('readAloud.short');
    expect(m.texts()).toContain('readAloud.tooShort {"labels":"Avsnitt 1"}');
    expect(m.button('readAloud.submit')?.props.disabled).toBe(true);
  });

  it('deletes the takes the teacher will not hear after the hand-in', async () => {
    mockUploadRecording
      .mockResolvedValueOnce({ assetId: 'first' })
      .mockResolvedValueOnce({ assetId: 'second' });
    const m = await mount();
    await m.press('readAloud.card.start');
    await recordTake(m);
    await recordTake(m, 'readAloud.again');
    await m.flush();
    m.checkTable.mockResolvedValue({
      attemptId: 'att-1',
      correct: false,
      score: null,
      requiresReview: true,
      feedback: { summary: '' },
    });
    await m.press('readAloud.submit');
    expect(m.checkTable.mock.calls[0][0].recordings[0]).toMatchObject({
      assetId: 'second',
      takes: 2,
    });
    expect(mockDeleteMediaAsset).toHaveBeenCalledWith('first');
  });

  it('gives a refused take its slot back and says why', async () => {
    const m = await mount({ recording: { takes: 1 } });
    await m.press('readAloud.card.start');
    await recordTake(m);
    await m.flush();
    expect(m.texts()).toContain('readAloud.spent');

    m.checkTable.mockRejectedValue(
      new ApiError({
        message: 'x',
        status: 422,
        code: 'RA_RECORDING_LENGTH',
        body: { code: 'RA_RECORDING_LENGTH', itemIds: ['p1'] },
      }),
    );
    await m.press('readAloud.submit');
    expect(m.texts()).toContain(
      'readAloud.refused.length {"labels":"Avsnitt 1"}',
    );
    expect(mockDeleteMediaAsset).toHaveBeenCalledWith('asset-1');
    expect(m.button('readAloud.start')).toBeDefined();
    expect(m.finishTable).not.toHaveBeenCalled();
  });

  it('treats a lost answer as delivered when the attempt is with the teacher', async () => {
    const m = await mount();
    await m.press('readAloud.card.start');
    await recordTake(m);
    await m.flush();
    m.checkTable.mockRejectedValue(
      new ApiError({ message: 'timeout', status: null }),
    );
    mockGetAttempt.mockResolvedValue({
      id: 'att-1',
      status: 'ROUTED_FOR_REVIEW',
    });
    await m.press('readAloud.submit');
    expect(m.finishTable).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: 'att-1', requiresReview: true }),
    );
    expect(m.texts()).toContain('readAloud.sentTitle');
  });

  it('spends no take on an interruption (RA-V3)', async () => {
    const m = await mount();
    await m.press('readAloud.card.start');
    await m.press('readAloud.start');
    await m.flush();
    await act(async () => {
      m.mic.interrupt('ended');
    });
    expect(m.mic.calls).toContain('cancel');
    expect(m.texts()).toContain('readAloud.interrupted');
    expect(m.texts()).toContain('readAloud.idle.head {"n":0,"total":2}');
    expect(mockUploadRecording).not.toHaveBeenCalled();
  });

  it('shows the refusal of the microphone as its own state', async () => {
    const m = await mount({ recording: { micCheck: true } });
    m.mic.openResult = 'denied';
    await m.press('readAloud.card.start');
    await m.flush();
    expect(m.texts()).toContain('readAloud.mic.denied');
    m.mic.openResult = 'ok';
    await m.press('readAloud.retry');
    await m.flush();
    expect(m.texts()).toContain('readAloud.mic.head');
    expect(m.mic.calls).toContain('meter:on');
  });

  it('passes the level check on what it hears', async () => {
    const m = await mount({ recording: { micCheck: true } });
    await m.press('readAloud.card.start');
    await m.flush();
    m.mic.setLevel(0.5);
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(m.texts()).toContain('readAloud.mic.ok');
    await m.press('readAloud.mic.ready');
    expect(m.mic.calls).toContain('meter:off');
    expect(m.button('readAloud.start')).toBeDefined();
  });

  it('opens on the teacher and closes the item when work is waiting', async () => {
    mockRecentAttempts.mockResolvedValue([
      {
        id: 'sent-1',
        status: 'ROUTED_FOR_REVIEW',
        templateCode: 'read_aloud',
        submittedAnswer: {
          recordings: [{ itemId: 'p1', assetId: 'x1', seconds: 12, takes: 1 }],
        },
        draftAnswer: null,
      },
    ]);
    const m = await mount();
    expect(m.texts()).toContain('readAloud.sentTitle');
    expect(m.finishTable).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: 'sent-1', requiresReview: true }),
    );
    expect(m.openAttempt).not.toHaveBeenCalled();
  });

  it('brings back the takes on the draft of the attempt it joins (RA-R10)', async () => {
    mockRecentAttempts.mockResolvedValue([
      {
        id: 'att-1',
        status: 'IN_PROGRESS',
        templateCode: 'read_aloud',
        submittedAnswer: null,
        draftAnswer: {
          takes: { p1: [{ n: 1, assetId: 'kept', seconds: 15 }] },
          chosen: {},
        },
      },
    ]);
    mockGetMediaAsset.mockResolvedValue({
      id: 'kept',
      mimeType: 'audio/mp4',
      url: 'u',
      status: 'READY',
      entityId: 'att-1',
      peaks: [0.1, 0.5],
    });
    const m = await mount();
    await m.press('readAloud.card.start');
    await m.flush();
    expect(m.texts()).toContain('readAloud.idle.head {"n":1,"total":2}');
    expect(m.button('readAloud.submit')?.props.disabled).toBe(false);
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });

  const SNAPSHOT = {
    criteria: [
      {
        id: 'c1',
        name: 'Uttale',
        desc: '',
        weight: 2,
        levels: ['l0', 'l1', 'l2', 'l3'],
        studentVisible: true,
      },
      {
        id: 'c2',
        name: 'Flyt',
        desc: '',
        weight: 1,
        levels: ['f0', 'f1', 'f2', 'f3'],
        studentVisible: false,
      },
    ],
    passScore: 6,
  };

  it('draws the graded card and offers a redo for returned work', async () => {
    mockRecentAttempts.mockResolvedValue([
      {
        id: 'g-1',
        status: 'RETURNED',
        templateCode: 'read_aloud',
        submittedAnswer: {
          recordings: [{ itemId: 'p1', assetId: 'x1', seconds: 12, takes: 1 }],
        },
        draftAnswer: null,
        passed: false,
        rubricMarks: { 'p1:c1': 1, 'p1:c2': 2 },
        rubricSnapshot: SNAPSHOT,
        reviewDecisions: [
          { itemId: 'p1', approved: false, comment: 'Øv på r-lyden.' },
        ],
        reviewComment: null,
      },
    ]);
    const m = await mount();
    const text = m.texts();
    expect(text).toContain('readAloud.graded.outcome.rewrite');
    // 1 × 2 + 2 × 1 out of 3 × 2 + 3 × 1 — added up by the kernel's function.
    expect(text).toContain('readAloud.graded.points {"score":4,"max":9}');
    expect(text).toContain('Uttale');
    expect(text).toContain('l1');
    expect(text).not.toContain('Flyt');
    expect(text).toContain('Øv på r-lyden.');
    expect(m.finishTable).not.toHaveBeenCalled();

    await m.press('readAloud.graded.redo');
    expect(m.openAttempt).toHaveBeenCalled();
    expect(m.button('readAloud.start')).toBeDefined();
  });

  it('closes the item on a passed verdict and hides criteria under showRubric: never', async () => {
    mockRecentAttempts.mockResolvedValue([
      {
        id: 'g-2',
        status: 'SCORED',
        templateCode: 'read_aloud',
        submittedAnswer: {
          recordings: [{ itemId: 'p1', assetId: 'x1', seconds: 12, takes: 1 }],
        },
        draftAnswer: null,
        passed: true,
        rubricMarks: { 'p1:c1': 3, 'p1:c2': 3 },
        rubricSnapshot: SNAPSHOT,
        reviewDecisions: [{ itemId: 'p1', approved: true, comment: 'Fint.' }],
        reviewComment: null,
      },
    ]);
    const m = await mount();
    expect(m.texts()).toContain('readAloud.graded.outcome.passed');
    expect(m.texts()).toContain('readAloud.graded.points {"score":9,"max":9}');
    expect(m.button('readAloud.graded.redo')).toBeUndefined();
    expect(m.finishTable).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: 'g-2', requiresReview: true }),
    );
  });
});
