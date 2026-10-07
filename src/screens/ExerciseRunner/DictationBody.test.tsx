import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../../api/client';
import type { ExerciseDisplay } from '../../api/types';
import { DictationBody } from './DictationBody';
import type { ExerciseBodyProps } from './ExerciseBody';

/**
 * The body is the whole solver on the phone — it owns the sentence on screen, the retry, the
 * reveal, the rest after a check and the resume — so its rules are tested here, against a
 * fake `checkTable`, the way the web tests `dictation-solver.tsx`.
 */

const mockFindOpenAttempt = jest.fn();

jest.mock('../../api/exercises', () => ({
  findOpenAttempt: (...args: unknown[]) => mockFindOpenAttempt(...args),
}));

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

/** No clip: the listening layer is the audio layer's to test (plan 56). */
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
  AudioGateScreen: () => null,
  AudioLockNote: () => null,
  AudioSegmentButton: () => null,
  AudioTranscript: () => null,
  ExerciseAudioPlayer: () => null,
}));

const DISPLAY: ExerciseDisplay = {
  id: 'ex-1',
  templateCode: 'dictation',
  targetLanguage: 'nb',
  content: {
    instruction: 'Hør og skriv.',
    mode: 'segments',
    segments: [{ id: 's1' }, { id: 's2' }],
    settings: {
      attempts: 2,
      hints: true,
      revealKey: true,
      showWordCount: false,
    },
  },
};

function fresh(segmentId: string) {
  return {
    segmentId,
    checks: 0,
    firstScore: null,
    firstPassed: null,
    passed: false,
    revealed: false,
    closed: false,
    lastText: '',
    last: null,
    key: null,
    transcriptSlice: null,
  };
}

/** The engine's answer to a check of `s1`, shaped as plan 68 phase 4 contracted it. */
function verdict(patch: Record<string, unknown> = {}) {
  return {
    score: 50,
    correct: false,
    details: {
      segmentId: 's1',
      pct: 50,
      passed: false,
      words: { total: 2, exact: 1, near: 0, wrong: 1, missing: 0, extra: 0 },
      ops: [
        { k: 'eq', w: 'Jeg', p: '' },
        {
          k: 'sub',
          wrote: 'boor',
          expected: 'bor',
          p: '.',
          cls: 'typo',
          near: false,
          focus: false,
        },
      ],
      nearCredit: false,
      focus: [],
      attempt: 1,
      checksLeft: 1,
      closed: false,
      revealed: false,
      segments: [
        { ...fresh('s1'), checks: 1, lastText: 'Jeg boor.' },
        fresh('s2'),
      ],
      complete: false,
      attemptPct: 25,
      attemptPassed: false,
      ...patch,
    },
  };
}

async function mount(overrides: Partial<ExerciseBodyProps> = {}) {
  const checkTable = jest.fn();
  const finishTable = jest.fn();
  const props: ExerciseBodyProps = {
    display: DISPLAY,
    phase: 'answering',
    disabled: false,
    verdict: null,
    onAnswerChange: jest.fn(),
    answerQuestion: jest.fn(),
    checkRow: jest.fn(),
    checkTable,
    finishTable,
    openAttempt: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<DictationBody {...props} />);
  });
  const root = renderer.root;

  const field = () => root.findByType(TextInput);
  const button = (key: string) =>
    root
      .findAllByType(TouchableOpacity)
      .find(b =>
        b.findAllByType(Text).some(t => String(t.props.children).includes(key)),
      );
  const texts = () =>
    root
      .findAllByType(Text)
      .map(t => [t.props.children].flat().join(''))
      .join('\n');
  const type = async (value: string) => {
    await act(async () => {
      field().props.onChangeText(value);
    });
  };
  const press = async (key: string) => {
    const b = button(key);
    if (b === undefined) throw new Error(`No button ${key}`);
    await act(async () => {
      await b.props.onPress();
    });
  };

  return {
    checkTable,
    finishTable,
    field,
    button,
    texts,
    type,
    press,
    renderer,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockFindOpenAttempt.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('DictationBody', () => {
  it('keeps the keyboard from fixing what the learner wrote (AC-R11)', async () => {
    const { field } = await mount();
    expect(field().props).toMatchObject({
      autoCorrect: false,
      autoCapitalize: 'none',
      spellCheck: false,
      autoComplete: 'off',
    });
  });

  it('refuses a dictation that arrived with its sentences', async () => {
    const { texts } = await mount({
      display: {
        ...DISPLAY,
        content: {
          ...DISPLAY.content,
          segments: [{ id: 's1', text: 'Jeg bor.' }],
        },
      },
    });
    expect(texts()).toContain('exerciseRunner.dictation.unavailable');
  });

  it('does not check an empty field (AC-R4)', async () => {
    const { button, type } = await mount();
    expect(button('exerciseRunner.dictation.check')?.props.disabled).toBe(true);
    await type('   ');
    expect(button('exerciseRunner.dictation.check')?.props.disabled).toBe(true);
    await type('Jeg bor.');
    expect(button('exerciseRunner.dictation.check')?.props.disabled).toBe(
      false,
    );
  });

  it('sends the sentence as typed and draws the corrected line', async () => {
    const { checkTable, type, press, texts, field } = await mount();
    checkTable.mockResolvedValue(verdict());
    await type('Jeg boor.');
    await press('exerciseRunner.dictation.check');

    expect(checkTable).toHaveBeenCalledWith({
      segmentId: 's1',
      text: 'Jeg boor.',
    });
    expect(texts()).toContain('exerciseRunner.dictation.corrected');
    expect(texts()).toContain(
      'exerciseRunner.dictation.verdictHead {"correct":1,"count":2}.',
    );
    // Locked once checked.
    expect(field().props.editable).toBe(false);
  });

  it('keeps the text on a retry, and moves the check on (AC-R8)', async () => {
    const { checkTable, type, press, field, texts } = await mount();
    checkTable.mockResolvedValue(verdict());
    await type('Jeg boor.');
    await press('exerciseRunner.dictation.check');
    await press('exerciseRunner.dictation.retry');

    expect(field().props.value).toBe('Jeg boor.');
    expect(field().props.editable).toBe(true);
    expect(texts()).toContain(
      'exerciseRunner.dictation.attemptOf {"n":2,"max":2}',
    );
  });

  it('rests «Check» for two seconds after a check (Q4-A)', async () => {
    const { checkTable, type, press, button } = await mount();
    checkTable.mockResolvedValue(verdict());
    await type('Jeg boor.');
    await press('exerciseRunner.dictation.check');
    await press('exerciseRunner.dictation.retry');
    expect(button('exerciseRunner.dictation.check')?.props.disabled).toBe(true);

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(button('exerciseRunner.dictation.check')?.props.disabled).toBe(
      false,
    );
  });

  it('says to wait on a 429, and keeps the text', async () => {
    const { checkTable, type, press, texts, field } = await mount();
    checkTable.mockRejectedValue(
      new ApiError({ message: 'too fast', status: 429 }),
    );
    await type('Jeg bor.');
    await press('exerciseRunner.dictation.check');

    expect(texts()).toContain('exerciseRunner.dictation.tooFast');
    expect(field().props.value).toBe('Jeg bor.');
  });

  it('reveals on request and shows the sentence (AC-R9)', async () => {
    const { checkTable, type, press, texts } = await mount();
    checkTable.mockResolvedValueOnce(verdict()).mockResolvedValueOnce(
      verdict({
        ops: [],
        revealed: true,
        closed: true,
        key: { text: 'Jeg bor.', why: 'Bor med én o.', focus: [] },
        segments: [
          {
            ...fresh('s1'),
            checks: 1,
            revealed: true,
            closed: true,
            key: { text: 'Jeg bor.', why: 'Bor med én o.', focus: [] },
          },
          fresh('s2'),
        ],
      }),
    );
    await type('Jeg boor.');
    await press('exerciseRunner.dictation.check');
    await press('exerciseRunner.dictation.showKey');

    expect(checkTable).toHaveBeenLastCalledWith({
      segmentId: 's1',
      reveal: true,
    });
    expect(texts()).toContain('Jeg bor.');
    expect(texts()).toContain('Bor med én o.');
    expect(texts()).toContain('exerciseRunner.dictation.next →');
  });

  it('reports the closing submit once, with the attempt’s pass, then opens the summary', async () => {
    const { checkTable, finishTable, type, press, texts } = await mount({
      display: {
        ...DISPLAY,
        content: { ...DISPLAY.content, segments: [{ id: 's1' }] },
      },
    });
    const closing = verdict({
      passed: true,
      pct: 100,
      ops: [
        { k: 'eq', w: 'Jeg', p: '' },
        { k: 'eq', w: 'bor', p: '.' },
      ],
      closed: true,
      complete: true,
      attemptPct: 100,
      attemptPassed: true,
      segments: [
        {
          ...fresh('s1'),
          checks: 1,
          firstScore: 1,
          firstPassed: true,
          passed: true,
          closed: true,
          last: {
            pct: 100,
            words: { total: 2, exact: 2 },
            ops: [{ k: 'eq', w: 'Jeg', p: '' }],
          },
        },
      ],
    });
    checkTable.mockResolvedValue({ ...closing, correct: false });
    await type('Jeg bor.');
    await press('exerciseRunner.dictation.check');

    expect(finishTable).toHaveBeenCalledTimes(1);
    expect(finishTable.mock.calls[0][0]).toMatchObject({ correct: true });

    await press('exerciseRunner.dictation.finish');
    expect(texts()).toContain(
      'exerciseRunner.dictation.summaryCount {"n":1,"count":1}',
    );
  });

  it('resumes on the first open sentence with its last checked text (plan 68 §8, 3)', async () => {
    mockFindOpenAttempt.mockResolvedValue({
      attemptId: 'att-1',
      segmentStates: [
        { ...fresh('s1'), checks: 1, passed: true, closed: true },
        { ...fresh('s2'), checks: 1, lastText: 'Det er kalt' },
      ],
    });
    const { field, texts } = await mount();

    expect(field().props.value).toBe('Det er kalt');
    expect(texts()).toContain('exerciseRunner.dictation.fieldSentence {"n":2}');
    expect(texts()).toContain(
      'exerciseRunner.dictation.attemptOf {"n":2,"max":2}',
    );
  });
});
