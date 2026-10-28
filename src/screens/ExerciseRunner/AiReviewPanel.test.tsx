import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AiReviewPanel } from './AiReviewPanel';

/**
 * A model's review on a school's work under a model-first policy (plan 80): the panel says
 * whether it waits for the teacher — and takes no dispute then — or counted at the term.
 */

const mockGetAiReview = jest.fn();

jest.mock('../../api/aiReview', () => ({
  ...jest.requireActual('../../api/aiReview'),
  getAiReview: (...a: unknown[]) => mockGetAiReview(...a),
  disputeAiReview: jest.fn(),
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
  outcome: 'approved',
  items: [],
  summary: 'Bra jobbet.',
  marks: null,
  reviewedAt: '2026-10-25T09:01:00.000Z',
  disputedAt: null,
  provisional: false,
  countsAt: null,
  acceptedAtTerm: false,
};

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map(node => {
    const children = ([] as unknown[]).concat(node.props.children);
    return children.filter(c => typeof c === 'string').join('');
  });
}

async function render() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(
      <AiReviewPanel exerciseId="ex-1" attemptId="att-1" templateCode="translate_to_target" criteria={new Map()} />,
    );
  });
  return tree;
}

beforeEach(() => mockGetAiReview.mockReset());

describe('AiReviewPanel at a school (plan 80)', () => {
  it('says a provisional review waits for the teacher, when it counts by itself, and takes no dispute', async () => {
    mockGetAiReview.mockResolvedValue({ ...REVIEW, provisional: true, countsAt: '2026-11-01T09:00:00.000Z' });
    const shown = texts(await render());

    expect(shown).toContain('exerciseRunner.aiReview.provisionalTitle');
    expect(shown.some(s => s.startsWith('exerciseRunner.aiReview.provisionalNote {"date":'))).toBe(true);
    expect(shown).not.toContain('exerciseRunner.aiReview.dispute');
  });

  it('says so when a provisional review has no term to count at', async () => {
    mockGetAiReview.mockResolvedValue({ ...REVIEW, provisional: true });
    expect(texts(await render())).toContain('exerciseRunner.aiReview.provisionalNoteNoTerm');
  });

  it('says a review counted at the term, and still takes a dispute', async () => {
    mockGetAiReview.mockResolvedValue({ ...REVIEW, acceptedAtTerm: true });
    const shown = texts(await render());

    expect(shown).toContain('exerciseRunner.aiReview.acceptedAtTermTitle');
    expect(shown).toContain('exerciseRunner.aiReview.acceptedAtTermNote');
    expect(shown).toContain('exerciseRunner.aiReview.dispute');
  });

  it('adds nothing to a review that simply counts', async () => {
    mockGetAiReview.mockResolvedValue(REVIEW);
    const shown = texts(await render());

    expect(shown.some(s => s.includes('provisional') || s.includes('acceptedAtTerm'))).toBe(false);
  });
});
