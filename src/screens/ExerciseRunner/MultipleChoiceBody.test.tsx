import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../../api/client';
import type { ExerciseDisplay } from '../../api/types';
import type { ExerciseBodyProps, FooterAction } from './ExerciseBody';
import { MultipleChoiceBody } from './MultipleChoiceBody';

/**
 * A new-form set has one button at a time, and it is the footer: the question's Check, then
 * «Next» / «Finish the set», and «Finish the set» hands the set in by itself. Two «Check»
 * buttons on one screen and a two-press hand-in were what the live check found (OQ-S3,
 * session 10).
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
  templateCode: 'multiple_choice',
  targetLanguage: 'nb',
  content: {
    instruction: 'Velg riktig form.',
    questions: [
      {
        id: 'q1',
        kind: 'grammar',
        stem: 'Jeg ___ i 2022.',
        options: [
          { id: 'a', text: 'jobbet' },
          { id: 'b', text: 'har jobbet' },
        ],
      },
    ],
    settings: { retry: 'one' },
  },
};

const VERDICT = { attemptId: 'at-1', score: 100, correct: true };

function closedPick(correct = true) {
  return {
    attemptId: 'at-1',
    templateCode: 'multiple_choice',
    answered: 1,
    result: {
      questionId: 'q1',
      optionId: 'a',
      correct,
      closed: true,
      attempt: 1,
      attemptsLeft: 0,
      keyOptionId: 'a',
    },
  };
}

async function mount(overrides: Partial<ExerciseBodyProps> = {}) {
  let footer: FooterAction | null = null;
  const setFooterAction = jest.fn((a: FooterAction | null) => {
    footer = a;
  });
  const props: ExerciseBodyProps = {
    display: DISPLAY,
    phase: 'answering',
    disabled: false,
    verdict: null,
    onAnswerChange: jest.fn(),
    answerQuestion: jest.fn().mockResolvedValue(closedPick()),
    checkRow: jest.fn(),
    checkTable: jest.fn().mockResolvedValue(VERDICT),
    finishTable: jest.fn(),
    openAttempt: jest.fn(),
    setFooterAction,
    ...overrides,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<MultipleChoiceBody {...props} />);
  });
  const root = renderer.root;
  const texts = () =>
    root
      .findAllByType(Text)
      .map(t => [t.props.children].flat().join(''))
      .join(' | ');
  const option = (text: string) =>
    root
      .findAllByType(TouchableOpacity)
      .find(b => b.props.accessibilityLabel === text)!;
  const press = async (a: FooterAction | null | (() => void)) => {
    await act(async () => {
      if (typeof a === 'function') a();
      else await a!.onPress();
    });
  };
  return { props, root, texts, option, press, footer: () => footer };
}

beforeEach(() => {
  mockFindOpenAttempt.mockReset();
  mockFindOpenAttempt.mockResolvedValue(null);
});

describe('MultipleChoiceBody — one button, in the footer', () => {
  it('puts the question Check in the footer, not in the body', async () => {
    const m = await mount();
    expect(m.footer()).toMatchObject({ label: 'exerciseRunner.multipleChoice.check', disabled: true });
    // No button of the body's own says Check or Finish: options are the only presses there.
    const own = m.root
      .findAllByType(TouchableOpacity)
      .filter(b => b.props.accessibilityRole !== 'radio');
    expect(own).toHaveLength(0);

    await m.press(() => m.option('jobbet').props.onPress());
    expect(m.footer()).toMatchObject({ label: 'exerciseRunner.multipleChoice.check', disabled: false });

    await m.press(m.footer());
    expect(m.props.answerQuestion).toHaveBeenCalledWith('q1', { optionId: 'a' });
    expect(m.footer()?.label).toBe('exerciseRunner.multipleChoice.finish');
  });

  it('hands the set in with «Finish the set» — one press, no hint about a button below', async () => {
    const m = await mount();
    await m.press(() => m.option('jobbet').props.onPress());
    await m.press(m.footer());
    await m.press(m.footer());

    expect(m.props.checkTable).toHaveBeenCalledTimes(1);
    expect(m.props.finishTable).toHaveBeenCalledWith(VERDICT);
    expect(m.texts()).toContain('exerciseRunner.multipleChoice.doneTitle');
    expect(m.texts()).not.toContain('doneHint');
  });

  it('keeps «Hand in» on the completion screen when the hand-in is refused, and tries again', async () => {
    const checkTable = jest
      .fn()
      .mockRejectedValueOnce(
        new ApiError({
          message: 'school',
          status: 409,
          body: { code: 'SCHOOL_NOT_ACTIVE', schoolStatus: 'suspended' },
        }),
      )
      .mockResolvedValueOnce(VERDICT);
    const m = await mount({ checkTable });
    await m.press(() => m.option('jobbet').props.onPress());
    await m.press(m.footer());
    await m.press(m.footer());

    expect(m.props.finishTable).not.toHaveBeenCalled();
    expect(m.footer()).toMatchObject({
      label: 'exerciseRunner.multipleChoice.handIn',
      error: 'schoolLifecycle.schoolSuspended',
    });

    await m.press(m.footer());
    expect(checkTable).toHaveBeenCalledTimes(2);
    expect(m.props.finishTable).toHaveBeenCalledWith(VERDICT);
  });

  it('a set resumed with every question closed waits for «Hand in»', async () => {
    mockFindOpenAttempt.mockResolvedValue({
      attemptId: 'at-1',
      pickedOptions: [
        { questionId: 'q1', picks: ['a'], eliminated: [], correct: true, closed: true, revealed: false },
      ],
    });
    const m = await mount();
    expect(m.texts()).toContain('exerciseRunner.multipleChoice.doneTitle');
    expect(m.footer()?.label).toBe('exerciseRunner.multipleChoice.handIn');
    expect(m.props.checkTable).not.toHaveBeenCalled();

    await m.press(m.footer());
    expect(m.props.finishTable).toHaveBeenCalledWith(VERDICT);
  });

  it('gives the footer back while the body is locked', async () => {
    const m = await mount({ disabled: true });
    expect(m.footer()).toBeNull();
  });
});
