import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { ExerciseDisplay } from '../../api/types';
import type { ExerciseBodyProps, FooterAction } from './ExerciseBody';
import { SentenceSchemaBody } from './SentenceSchemaBody';

/**
 * The step's main button is the footer, and «Finish» hands the set in by itself — no board
 * «Check» over the shell's dead one, no second press (OQ-S3 live check, session 10).
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

jest.mock('../../hooks/useExerciseAudio', () => ({
  useExerciseAudio: () => ({
    audio: { enabled: false, settings: { layout: 'top', transcriptWhen: 'never' } },
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
  templateCode: 'sentence_schema',
  targetLanguage: 'nb',
  content: {
    title: 'Leddsetninger',
    instruction: 'Sett ordene på riktig plass.',
    rows: [
      {
        id: 'r1',
        clause: 'sub',
        fields: [
          { id: 'sub', short: 'sub', label: 'Subjunksjon', hint: '', optional: false },
          { id: 'subj', short: 'S', label: 'Subjekt', hint: '', optional: false },
        ],
        bank: [
          { id: 'c1', text: 'at' },
          { id: 'c2', text: 'hun' },
        ],
        source: 'Hun kommer.',
        counts: null,
        start: {},
      },
    ],
    settings: { labels: true, hints: true, perField: true, orderOnly: false },
  },
};

const VERDICT = { attemptId: 'at-1', score: 0, correct: false };

async function mount(overrides: Partial<ExerciseBodyProps> = {}) {
  let footer: FooterAction | null = null;
  const props: ExerciseBodyProps = {
    display: DISPLAY,
    phase: 'answering',
    disabled: false,
    verdict: null,
    onAnswerChange: jest.fn(),
    answerQuestion: jest.fn(),
    checkRow: jest.fn().mockResolvedValue({
      result: {
        rowId: 'r1',
        solved: false,
        attempt: 1,
        wrong: 0,
        score: 0,
        solution: { sub: ['c1'], subj: ['c2'] },
      },
    }),
    checkTable: jest.fn().mockResolvedValue(VERDICT),
    finishTable: jest.fn(),
    openAttempt: jest.fn(),
    setFooterAction: jest.fn((a: FooterAction | null) => {
      footer = a;
    }),
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<SentenceSchemaBody {...props} />);
  });
  const root = renderer.root;
  const buttonWith = (key: string) =>
    root
      .findAllByType(TouchableOpacity)
      .find(b => b.findAllByType(Text).some(t => String(t.props.children).includes(key)));
  const run = async (fn: () => unknown) => {
    await act(async () => {
      await fn();
    });
  };
  return { props, root, buttonWith, run, footer: () => footer };
}

beforeEach(() => {
  mockFindOpenAttempt.mockReset();
  mockFindOpenAttempt.mockResolvedValue(null);
});

describe('SentenceSchemaBody — the main button is the footer', () => {
  it('has no Check of its own; the footer holds it', async () => {
    const m = await mount();
    expect(m.buttonWith('sentenceSchema.check')).toBeUndefined();
    expect(m.footer()?.label).toContain('exerciseRunner.sentenceSchema.check');
    expect(m.footer()?.disabled).toBe(true);
    // The quieter ways past a sentence stay under the board.
    expect(m.buttonWith('sentenceSchema.reveal')).toBeDefined();
  });

  it('hands the set in with «Finish», one press', async () => {
    const m = await mount();
    await m.run(() => m.buttonWith('sentenceSchema.reveal')!.props.onPress());
    expect(m.footer()?.label).toBe('exerciseRunner.sentenceSchema.finishSet');

    await m.run(() => m.footer()!.onPress());
    expect(m.props.checkTable).toHaveBeenCalledTimes(1);
    expect(m.props.finishTable).toHaveBeenCalledWith(VERDICT);
  });

  it('keeps «Hand in» when the hand-in fails', async () => {
    const checkTable = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(VERDICT);
    const m = await mount({ checkTable });
    await m.run(() => m.buttonWith('sentenceSchema.reveal')!.props.onPress());
    await m.run(() => m.footer()!.onPress());

    expect(m.footer()).toMatchObject({
      label: 'exerciseRunner.sentenceSchema.handIn',
      error: 'exerciseRunner.sentenceSchema.sendFailed',
    });
    await m.run(() => m.footer()!.onPress());
    expect(m.props.finishTable).toHaveBeenCalledWith(VERDICT);
  });
});
