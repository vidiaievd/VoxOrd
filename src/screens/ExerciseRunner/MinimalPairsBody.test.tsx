import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../../api/client';
import type { ExerciseDisplay } from '../../api/types';
import type { ClipPlayer } from '../../hooks/useClipPlayer';
import type { ExerciseBodyProps } from './ExerciseBody';
import { MinimalPairsBody } from './MinimalPairsBody';

/**
 * The body is the whole solver on the phone — the card, one probe at a time against the server,
 * the second chance, the result — so its rules are tested here against mocked services and a
 * clip player that plays nothing.
 */

const mockHandOutProbe = jest.fn();

jest.mock('../../api/exercises', () => ({
  handOutProbe: (...a: unknown[]) => mockHandOutProbe(...a),
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

const projection = {
  title: 'kj / sj',
  instruction: '',
  language: 'nb',
  contrast: { label: 'kj / sj', ipa: '' },
  set: { probes: 2, playsPerProbe: 2, autoplay: false },
  feedback: {
    immediate: true,
    abCompare: true,
    showSpelling: 'afterAnswer',
    showGloss: 'afterAnswer',
    showIpa: false,
    secondChance: true,
  },
};

const display = (content: Record<string, unknown> = projection): ExerciseDisplay => ({
  id: 'ex1',
  templateCode: 'minimal_pairs',
  targetLanguage: 'nb',
  content,
});

const probe = (n: number) => ({
  n,
  total: 2,
  questionId: `p${n}`,
  clip: { url: `https://cdn/${n}.mp3`, expiresAt: '', durationMs: 700, provenance: 'studio' },
  options: [{ id: 'a' }, { id: 'b' }],
  state: { tries: 0, maxTries: 2, closed: false },
  closedProbes: [],
});

const verdict = (over: Record<string, unknown>) => ({
  result: {
    questionId: 'p1',
    n: 1,
    optionId: 'a',
    correct: true,
    closed: true,
    tries: 1,
    triesLeft: 1,
    firstCorrect: true,
    keyOptionId: 'a',
    options: [
      { id: 'a', text: 'kje' },
      { id: 'b', text: 'sje' },
    ],
    ...over,
  },
});

const details = {
  right: 2,
  total: 2,
  score: 100,
  passed: true,
  passPct: 70,
  pairs: [{ pairId: 'pr', words: ['kje', 'sje'], played: 2, correct: 2, clips: ['x', 'y'] }],
};

function silentPlayer(): ClipPlayer {
  return {
    play: jest.fn().mockResolvedValue('played'),
    sequence: jest.fn().mockResolvedValue('played'),
    stop: jest.fn(),
    current: () => null,
    subscribe: () => () => undefined,
  };
}

function props(over: Partial<ExerciseBodyProps> = {}): ExerciseBodyProps {
  return {
    display: display(),
    phase: 'answering',
    disabled: false,
    verdict: null,
    onAnswerChange: jest.fn(),
    answerQuestion: jest.fn(),
    checkRow: jest.fn(),
    checkTable: jest.fn(),
    finishTable: jest.fn(),
    openAttempt: jest.fn().mockResolvedValue('att1'),
    openedContent: () => projection,
    ...over,
  };
}

const flush = () => act(async () => undefined);

function render(p: ExerciseBodyProps) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<MinimalPairsBody {...p} player={silentPlayer()} />);
  });
  return tree;
}

const press = async (tree: ReactTestRenderer.ReactTestRenderer, label: string) => {
  const target = tree.root
    .findAllByType(TouchableOpacity)
    .find(
      b =>
        b.props.accessibilityLabel === label ||
        b.findAllByType(Text).some(t => String(t.props.children).includes(label)),
    );
  if (!target) throw new Error(`No button ${label}`);
  await act(async () => target.props.onPress());
};

const text = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(t => [t.props.children].flat().join(''))
    .join('|');

beforeEach(() => {
  mockHandOutProbe.mockReset();
});

describe('MinimalPairsBody', () => {
  it('shows the card first and opens no attempt until Start', () => {
    const p = props();
    const tree = render(p);
    expect(text(tree)).toContain('exerciseRunner.minimalPairs.card.start');
    expect(p.openAttempt).not.toHaveBeenCalled();
    expect(p.onAnswerChange).toHaveBeenCalledWith(null, false);
  });

  it('refuses a document that carries the key', () => {
    const tree = render(props({ display: display({ ...projection, pairs: [] }) }));
    expect(text(tree)).toContain('exerciseRunner.minimalPairs.unavailable');
  });

  it('says the sittings are used when the engine refuses the start', async () => {
    const openAttempt = jest.fn().mockRejectedValue(
      new ApiError({
        message: 'spent',
        status: 422,
        code: 'MP_SITTINGS_SPENT',
        body: { code: 'MP_SITTINGS_SPENT', allowed: 2 },
      }),
    );
    const tree = render(props({ openAttempt }));
    await press(tree, 'exerciseRunner.minimalPairs.card.start');
    expect(text(tree)).toContain('"count":2');
    expect(text(tree)).toContain('sittingsSpent');
  });

  it('walks a sitting: a second chance, the comparison, and the close', async () => {
    mockHandOutProbe
      .mockResolvedValueOnce(probe(1))
      .mockResolvedValueOnce(probe(2));
    const answerQuestion = jest
      .fn()
      // Wrong with a try left: nothing about the key.
      .mockResolvedValueOnce({
        result: {
          questionId: 'p1',
          n: 1,
          optionId: 'b',
          correct: false,
          closed: false,
          tries: 1,
          triesLeft: 1,
          firstCorrect: false,
          keyOptionId: 'a',
        },
      })
      .mockResolvedValueOnce(verdict({ optionId: 'a', firstCorrect: false, tries: 2 }))
      .mockResolvedValueOnce(
        verdict({ questionId: 'p2', n: 2, optionId: 'a', keyOptionId: 'a' }),
      );
    const checkTable = jest.fn().mockResolvedValue({
      attemptId: 'att1',
      correct: true,
      score: 100,
      requiresReview: false,
      feedback: { summary: '' },
      details,
    });
    const finishTable = jest.fn();
    const tree = render(props({ answerQuestion, checkTable, finishTable }));

    await press(tree, 'exerciseRunner.minimalPairs.card.start');
    await flush();
    expect(mockHandOutProbe).toHaveBeenCalledWith('ex1', 'att1');

    await press(tree, 'B');
    expect(answerQuestion).toHaveBeenLastCalledWith('p1', { optionId: 'b' });
    expect(text(tree)).toContain('exerciseRunner.minimalPairs.retry');
    expect(text(tree)).not.toContain('sje');

    await press(tree, 'A');
    expect(text(tree)).toContain('exerciseRunner.minimalPairs.right');

    await press(tree, 'exerciseRunner.minimalPairs.next');
    await flush();
    await press(tree, 'A');
    await press(tree, 'exerciseRunner.minimalPairs.seeResult');
    await flush();

    expect(checkTable).toHaveBeenCalledWith({});
    expect(finishTable).toHaveBeenCalledTimes(1);
    expect(finishTable.mock.calls[0][0]).toMatchObject({ correct: true });
    expect(text(tree)).toContain('exerciseRunner.minimalPairs.summary.passed');
    expect(text(tree)).toContain('kje / sje');
  });

  it('tells the runner a failed sitting did not pass, whatever the submit says', async () => {
    mockHandOutProbe.mockRejectedValueOnce(
      new ApiError({ message: 'closed', status: 422, code: 'ALL_PROBES_CLOSED' }),
    );
    const checkTable = jest.fn().mockResolvedValue({
      attemptId: 'att1',
      correct: true,
      score: 40,
      requiresReview: false,
      feedback: { summary: '' },
      details: { ...details, passed: false, score: 40, right: 1 },
    });
    const finishTable = jest.fn();
    const tree = render(props({ checkTable, finishTable }));
    await press(tree, 'exerciseRunner.minimalPairs.card.start');
    await flush();
    expect(finishTable.mock.calls[0][0]).toMatchObject({ correct: false });
    expect(text(tree)).toContain('exerciseRunner.minimalPairs.summary.again');
  });
});
