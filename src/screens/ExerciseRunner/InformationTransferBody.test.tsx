import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { ApiError } from '../../api/client';
import type { ExerciseDisplay } from '../../api/types';
import type { ExerciseBodyProps } from './ExerciseBody';
import { InformationTransferBody } from './InformationTransferBody';

/**
 * The body is the whole solver on the phone — the blank, the check, the retry that keeps the
 * frozen cells, the resume — so its rules are tested here against a fake `checkTable`, the way
 * the web tests `information-transfer-body.tsx`.
 */

const mockFindOpenBoardCheck = jest.fn();

jest.mock('../../api/exercises', () => ({
  findOpenBoardCheck: (...args: unknown[]) => mockFindOpenBoardCheck(...args),
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

const content = {
  title: 'Legetime',
  instruction: '',
  sourceKind: 'text',
  language: 'nb',
  passage: 'Du har time hos legen klokken 14.30.',
  form: { formTitle: 'Timebestilling', layout: 'form' },
  fields: [
    {
      id: 'f1',
      label: 'Klokkeslett',
      type: 'time',
      unit: '',
      placeholder: 'tt:mm',
      numeric: true,
    },
    {
      id: 'f2',
      label: 'Hvem',
      type: 'word',
      unit: '',
      placeholder: '',
      numeric: false,
    },
  ],
  answering: {
    showSource: 'always',
    oneAtATime: false,
    attempts: 2,
    revealKey: 'afterLastAttempt',
    hintsAfter: 9,
  },
};

const display = (c: Record<string, unknown> = content): ExerciseDisplay => ({
  id: 'ex1',
  templateCode: 'information_transfer',
  targetLanguage: 'nb',
  content: c,
});

const details = (over: Record<string, unknown> = {}) => ({
  totalItems: 2,
  passedItems: 1,
  correctNow: 1,
  pct: 50,
  passed: false,
  passPct: 70,
  missedRequired: 0,
  attempt: 1,
  checksLeft: 1,
  closed: false,
  revealed: false,
  locked: ['f1'],
  items: [
    {
      itemId: 'f1',
      value: '14.30',
      verdict: 'format',
      correct: true,
      canonical: '14:30',
    },
    {
      itemId: 'f2',
      value: 'lege',
      verdict: 'wrong',
      correct: false,
      why: 'Se på siste linje.',
    },
  ],
  ...over,
});

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
    openAttempt: jest.fn(),
    ...over,
  };
}

async function render(p: ExerciseBodyProps) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<InformationTransferBody {...p} />);
  });
  return tree;
}

const text = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(t => [t.props.children].flat().join(''))
    .join('|');

const type = async (
  tree: ReactTestRenderer.ReactTestRenderer,
  label: string,
  value: string,
) => {
  const input = tree.root
    .findAllByType(TextInput)
    .find(i => String(i.props.accessibilityLabel).startsWith(label));
  if (!input) throw new Error(`No input ${label}`);
  await act(async () => input.props.onChangeText(value));
};

const press = async (
  tree: ReactTestRenderer.ReactTestRenderer,
  label: string,
) => {
  const target = tree.root
    .findAllByType(TouchableOpacity)
    .find(b =>
      b
        .findAllByType(Text)
        .some(t => [t.props.children].flat().join('').includes(label)),
    );
  if (!target) throw new Error(`No button ${label}`);
  await act(async () => target.props.onPress());
};

beforeEach(() => {
  mockFindOpenBoardCheck.mockReset().mockResolvedValue(null);
});

describe('InformationTransferBody', () => {
  it('draws the source and the blank, and owns its check', async () => {
    const p = props();
    const tree = await render(p);
    expect(text(tree)).toContain('Du har time hos legen');
    expect(text(tree)).toContain('Timebestilling');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(2);
    expect(p.onAnswerChange).toHaveBeenCalledWith(null, false);
  });

  it('refuses a blank that carries the key', async () => {
    const bad = {
      ...content,
      fields: [{ ...content.fields[0], expected: ['14:30'] }],
    };
    const tree = await render(props({ display: display(bad) }));
    expect(text(tree)).toContain(
      'exerciseRunner.informationTransfer.unavailable',
    );
  });

  it('keeps Check off until a cell is filled, then sends every filled cell', async () => {
    const checkTable = jest
      .fn()
      .mockResolvedValue({ correct: false, details: details() });
    const tree = await render(props({ checkTable }));
    const check = () =>
      tree.root
        .findAllByType(TouchableOpacity)
        .find(b =>
          [b.findAllByType(Text)[0]?.props.children]
            .flat()
            .join('')
            .includes('.check'),
        )!;
    expect(check().props.disabled).toBe(true);

    await type(tree, 'Klokkeslett', '14.30');
    await type(tree, 'Hvem', 'lege');
    await press(tree, 'informationTransfer.check');
    expect(checkTable).toHaveBeenCalledWith({
      cells: { f1: '14.30', f2: 'lege' },
    });
  });

  it('shows the verdict, the reason and the key it was given — and offers the retry', async () => {
    const checkTable = jest
      .fn()
      .mockResolvedValue({ correct: false, details: details() });
    const finishTable = jest.fn();
    const tree = await render(props({ checkTable, finishTable }));
    await type(tree, 'Klokkeslett', '14.30');
    await type(tree, 'Hvem', 'lege');
    await press(tree, 'informationTransfer.check');

    const shown = text(tree);
    expect(shown).toContain('Se på siste linje.');
    expect(shown).toContain('14:30');
    expect(shown).toContain(
      'exerciseRunner.informationTransfer.scoreLine {"pct":50,"need":70}',
    );
    expect(shown).toContain('informationTransfer.retry');
    // An open blank is not reported to the shell.
    expect(finishTable).not.toHaveBeenCalled();
  });

  it('retries only the cells not counted and keeps the frozen one', async () => {
    const checkTable = jest
      .fn()
      .mockResolvedValue({ correct: false, details: details() });
    const tree = await render(props({ checkTable }));
    await type(tree, 'Klokkeslett', '14.30');
    await type(tree, 'Hvem', 'lege');
    await press(tree, 'informationTransfer.check');
    await press(tree, 'informationTransfer.retry');

    const [f1, f2] = tree.root.findAllByType(TextInput);
    expect(f1!.props.value).toBe('14.30');
    expect(f1!.props.editable).toBe(false);
    expect(f2!.props.value).toBe('');
    expect(f2!.props.editable).toBe(true);
  });

  it("reports the closing check once, with the engine's pass", async () => {
    const closed = details({
      passed: true,
      closed: true,
      passedItems: 2,
      correctNow: 2,
      pct: 100,
      locked: ['f1', 'f2'],
      items: [
        {
          itemId: 'f1',
          value: '14.30',
          verdict: 'format',
          correct: true,
          canonical: '14:30',
        },
        { itemId: 'f2', value: 'legen', verdict: 'ok', correct: true },
      ],
    });
    const checkTable = jest
      .fn()
      .mockResolvedValue({ correct: false, details: closed });
    const finishTable = jest.fn();
    const tree = await render(props({ checkTable, finishTable }));
    await type(tree, 'Klokkeslett', '14.30');
    await type(tree, 'Hvem', 'legen');
    await press(tree, 'informationTransfer.check');

    expect(finishTable).toHaveBeenCalledTimes(1);
    expect(finishTable.mock.calls[0][0].correct).toBe(true);
    expect(text(tree)).toContain('informationTransfer.doneHint');
    expect(text(tree)).not.toContain('informationTransfer.retry');
  });

  it('names a refusal the engine will keep making', async () => {
    const checkTable = jest
      .fn()
      .mockRejectedValue(new ApiError({ message: 'closed', status: 422 }));
    const tree = await render(props({ checkTable }));
    await type(tree, 'Hvem', 'lege');
    await press(tree, 'informationTransfer.check');
    expect(text(tree)).toContain('informationTransfer.closedAlready');
  });

  it('says so when the verdict is unreadable, and lets the learner press again', async () => {
    const checkTable = jest
      .fn()
      .mockResolvedValue({ correct: false, details: { nope: 1 } });
    const tree = await render(props({ checkTable }));
    await type(tree, 'Hvem', 'lege');
    await press(tree, 'informationTransfer.check');
    expect(text(tree)).toContain('informationTransfer.sendFailed');
  });

  it('adds the note that the key is withheld when it never shows', async () => {
    const never = {
      ...content,
      answering: { ...content.answering, revealKey: 'never' },
    };
    const checkTable = jest
      .fn()
      .mockResolvedValue({ correct: false, details: details() });
    const tree = await render(props({ display: display(never), checkTable }));
    await type(tree, 'Hvem', 'lege');
    await press(tree, 'informationTransfer.check');
    expect(text(tree)).toContain('informationTransfer.noKey');
  });

  it('walks one cell at a time into the first check', async () => {
    const walk = {
      ...content,
      answering: { ...content.answering, oneAtATime: true },
    };
    const tree = await render(props({ display: display(walk) }));
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    await type(tree, 'Klokkeslett', '14.30');
    await press(tree, 'informationTransfer.next');
    expect(
      String(tree.root.findAllByType(TextInput)[0]!.props.accessibilityLabel),
    ).toContain('Hvem');
    expect(text(tree)).toContain('informationTransfer.check');
  });

  it('resumes a blank left open after a check', async () => {
    mockFindOpenBoardCheck.mockResolvedValue(details());
    const finishTable = jest.fn();
    const tree = await render(props({ finishTable }));
    const [f1, f2] = tree.root.findAllByType(TextInput);
    expect(f1!.props.value).toBe('14.30');
    expect(f2!.props.value).toBe('lege');
    expect(text(tree)).toContain('Se på siste linje.');
    expect(text(tree)).toContain('informationTransfer.retry');
    expect(finishTable).not.toHaveBeenCalled();
  });
});
