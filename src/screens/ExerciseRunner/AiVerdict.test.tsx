import React from 'react';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AI_VERDICT_GIVE_UP_MS, AI_VERDICT_POLL_MS } from '../../hooks/useAiVerdictWait';
import { AiVerdict } from './AiVerdict';

/**
 * What the learner nobody reviews sees after handing free-form work to a model (plan 79,
 * step 2.3d): a wait, then the verdict over the review — always labelled as the AI's — or
 * an honest line when no model could read it.
 */

const mockGetAttempt = jest.fn();
const mockGetAiReview = jest.fn();
const mockDisputeAiReview = jest.fn();

jest.mock('../../api/exercises', () => ({
  getAttempt: (...a: unknown[]) => mockGetAttempt(...a),
}));

jest.mock('../../api/aiReview', () => ({
  ...jest.requireActual('../../api/aiReview'),
  getAiReview: (...a: unknown[]) => mockGetAiReview(...a),
  disputeAiReview: (...a: unknown[]) => mockDisputeAiReview(...a),
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

const REVIEW = {
  outcome: 'returned',
  items: [
    { itemId: 'i3', sentenceIndex: 2, aspect: 'lexis', fragment: 'butikken', comment: 'Indefinite here.', suggestion: 'en butikk' },
    { itemId: 'i1', sentenceIndex: 0, aspect: 'grammar', fragment: 'har gå', comment: 'Past participle.', suggestion: 'har gått' },
  ],
  summary: 'Almost there.',
  marks: null,
  reviewedAt: '2026-10-24T10:00:00.000Z',
  disputedAt: null,
};

const row = (over: Record<string, unknown> = {}) => ({
  id: 'att-1',
  status: 'RETURNED',
  templateCode: 'translate_to_target',
  submittedAnswer: null,
  draftAnswer: null,
  passed: false,
  reviewedBy: 'ai',
  rubricSnapshot: null,
  ...over,
});

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map(node => {
    const children = ([] as unknown[]).concat(node.props.children);
    return children.filter(c => typeof c === 'string').join('');
  });
}

function press(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  const button = tree.root
    .findAllByType(TouchableOpacity)
    .find(node => node.findAllByType(Text).some(text => text.props.children === label));
  if (!button) throw new Error(`no button «${label}»`);
  return act(async () => {
    button.props.onPress();
  });
}

async function render(templateCode = 'translate_to_target') {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <AiVerdict exerciseId="ex-1" attemptId="att-1" templateCode={templateCode} />,
    );
  });
  return tree;
}

async function tick(ms = AI_VERDICT_POLL_MS) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockGetAttempt.mockReset();
  mockGetAiReview.mockReset().mockResolvedValue(REVIEW);
  mockDisputeAiReview.mockReset().mockResolvedValue({ disputedAt: '2026-10-24T11:00:00.000Z' });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AiVerdict (plan 79, 2.3d)', () => {
  it('waits while the model reads, then shows its verdict over its labelled review', async () => {
    mockGetAttempt
      .mockResolvedValueOnce(row({ status: 'ROUTED_FOR_REVIEW', passed: null }))
      .mockResolvedValueOnce(row());
    const tree = await render();

    expect(texts(tree)).toContain('exerciseRunner.aiReview.reading');
    await tick();
    expect(texts(tree)).toContain('exerciseRunner.aiReview.reading');
    await tick();

    const shown = texts(tree);
    expect(shown).toContain('exerciseRunner.aiReview.returned');
    expect(shown.some(s => s.includes('exerciseRunner.aiReview.label'))).toBe(true);
    expect(shown).toContain('Almost there.');
    // Grouped by item, in the order of the work.
    const headings = shown.filter(s => s.startsWith('exerciseRunner.aiReview.sentence'));
    expect(headings).toEqual([
      'exerciseRunner.aiReview.sentence {"n":1}',
      'exerciseRunner.aiReview.sentence {"n":3}',
    ]);
    expect(mockGetAttempt).toHaveBeenCalledWith('ex-1', 'att-1');
    expect(mockGetAiReview).toHaveBeenCalledWith('ex-1', 'att-1');
  });

  it('says accepted for a passed verdict, and names an essay’s marks from the frozen rubric', async () => {
    mockGetAttempt.mockResolvedValue(
      row({ status: 'SCORED', passed: true, rubricSnapshot: { criteria: [{ id: 'c1', name: 'Task' }, { id: 'c2', name: '' }] } }),
    );
    mockGetAiReview.mockResolvedValue({
      ...REVIEW,
      outcome: 'approved',
      items: [],
      marks: [
        { criterionId: 'c2', mark: 3, reason: 'Clear.' },
        { criterionId: 'c1', mark: 2, reason: 'The closing is missing.' },
      ],
    });
    const tree = await render('writing_task');
    await tick();

    const shown = texts(tree);
    expect(shown).toContain('exerciseRunner.aiReview.approved');
    expect(shown).toContain('exerciseRunner.aiReview.noRemarks');
    expect(shown).toContain('exerciseRunner.aiReview.marksTitle');
    const names = shown.filter(s => s === 'Task · ' || s === 'exerciseRunner.aiReview.unnamed · ');
    expect(names).toEqual(['Task · ', 'exerciseRunner.aiReview.unnamed · ']);
  });

  it('says so when no model could read the work', async () => {
    mockGetAttempt.mockResolvedValue(row({ status: 'NO_REVIEWER', passed: null, reviewedBy: null }));
    const tree = await render();
    await tick();

    expect(texts(tree)).toContain('exerciseRunner.aiReview.dropped');
    expect(mockGetAiReview).not.toHaveBeenCalled();
  });

  it('stops asking after a while, and asks again on request', async () => {
    mockGetAttempt.mockResolvedValue(row({ status: 'ROUTED_FOR_REVIEW', passed: null }));
    const tree = await render();

    for (let spent = 0; spent <= AI_VERDICT_GIVE_UP_MS; spent += AI_VERDICT_POLL_MS) await tick();
    expect(texts(tree)).toContain('exerciseRunner.aiReview.slow');
    const asked = mockGetAttempt.mock.calls.length;
    await tick(AI_VERDICT_POLL_MS * 5);
    expect(mockGetAttempt.mock.calls.length).toBe(asked);

    mockGetAttempt.mockResolvedValue(row());
    await press(tree, 'exerciseRunner.aiReview.askAgain');
    expect(texts(tree)).toContain('exerciseRunner.aiReview.reading');
    await tick();
    expect(texts(tree)).toContain('exerciseRunner.aiReview.returned');
  });

  it('a failed request is «not yet», not the end of the wait', async () => {
    mockGetAttempt.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(row());
    const tree = await render();
    await tick();
    expect(texts(tree)).toContain('exerciseRunner.aiReview.reading');
    await tick();
    expect(texts(tree)).toContain('exerciseRunner.aiReview.returned');
  });

  it('takes one dispute, with the reason, and then only thanks', async () => {
    mockGetAttempt.mockResolvedValue(row());
    const tree = await render();
    await tick();

    await press(tree, 'exerciseRunner.aiReview.dispute');
    expect(texts(tree)).toContain('exerciseRunner.aiReview.disputeNote');
    await act(async () => {
      tree.root.findByType(TextInput).props.onChangeText('  Sentence 3 is fine. ');
    });
    await press(tree, 'exerciseRunner.aiReview.send');

    expect(mockDisputeAiReview).toHaveBeenCalledWith('ex-1', 'att-1', '  Sentence 3 is fine. ');
    expect(texts(tree)).toContain('exerciseRunner.aiReview.disputed');
    expect(texts(tree)).not.toContain('exerciseRunner.aiReview.dispute');
  });

  it('keeps the form open and says so when the dispute fails', async () => {
    mockGetAttempt.mockResolvedValue(row());
    mockDisputeAiReview.mockRejectedValue(new Error('nope'));
    const tree = await render();
    await tick();

    await press(tree, 'exerciseRunner.aiReview.dispute');
    await press(tree, 'exerciseRunner.aiReview.send');

    expect(texts(tree)).toContain('exerciseRunner.aiReview.sendFailed');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  });

  it('offers no button on a review already disputed, and keeps the label when loading fails', async () => {
    mockGetAttempt.mockResolvedValue(row());
    mockGetAiReview.mockResolvedValueOnce({ ...REVIEW, disputedAt: '2026-10-24T11:00:00.000Z' });
    const tree = await render();
    await tick();
    expect(texts(tree)).toContain('exerciseRunner.aiReview.disputed');
    expect(texts(tree)).not.toContain('exerciseRunner.aiReview.dispute');

    mockGetAiReview.mockRejectedValueOnce(new Error('down'));
    const failed = await render();
    await tick();
    const shown = texts(failed);
    expect(shown.some(s => s.includes('exerciseRunner.aiReview.failed'))).toBe(true);
    expect(shown.some(s => s.includes('exerciseRunner.aiReview.label'))).toBe(true);
  });
});
