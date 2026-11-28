import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AiReviewPanel, shortDate } from './AiReviewPanel';

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

const mockCardProps = jest.fn();
jest.mock('../SoundSessionScreen/SoundCardScreen', () => ({
  SoundCardScreen: (props: unknown) => {
    mockCardProps(props);
    return null;
  },
}));

const mockTrainSound = jest.fn();
let mockTrainAvailable = true;
jest.mock('../../navigation/trainSound', () => ({
  useTrainSound: () => (mockTrainAvailable ? mockTrainSound : null),
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

  it('does not ask to be told of mistakes on a review that does not count yet (OQ-110)', async () => {
    mockGetAiReview.mockResolvedValue({ ...REVIEW, provisional: true });
    const shown = texts(await render());

    expect(shown).toContain('exerciseRunner.aiReview.caveatProvisional');
    expect(shown).not.toContain('exerciseRunner.aiReview.caveat');
  });

  it('keeps the plain caveat on a review that counts', async () => {
    mockGetAiReview.mockResolvedValue(REVIEW);
    const shown = texts(await render());

    expect(shown).toContain('exerciseRunner.aiReview.caveat');
    expect(shown).not.toContain('exerciseRunner.aiReview.caveatProvisional');
  });

  it('writes the date without the short month’s own full stop, the sentence has one', () => {
    for (const language of ['ru', 'uk', 'nb', 'en']) {
      const date = shortDate('2026-12-05T10:00:00.000Z', language);
      expect(date).toMatch(/5/);
      expect(date.endsWith('.')).toBe(false);
    }
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

/** A reading's sound remarks (plan 88, 5c) and the way from one to its sound's card (OQ-10). */
describe('AiReviewPanel on a reading — weak sounds', () => {
  const READING = {
    ...REVIEW,
    summary: null,
    reading: {
      passPercent: 85,
      carriedItemIds: [],
      prompts: [
        {
          itemId: 'p1',
          transcript: 'jeg kjører',
          ops: [
            { k: 'read', i: 0, n: 1, heard: 'jeg', focus: false },
            { k: 'read', i: 1, n: 1, heard: 'kjører', focus: false },
          ],
          total: 2,
          read: 2,
          percent: 100,
          passed: true,
          pronunciation: null,
          wordsPerMinute: null,
        },
      ],
    },
    items: [
      { itemId: 'p1', sentenceIndex: 0, aspect: 'pronunciation', fragment: 'kjører', comment: 'Keep the tongue flat.', suggestion: null, soundAtomId: 'nb:kj' },
      { itemId: 'p1', sentenceIndex: 0, aspect: 'pronunciation', fragment: 'jeg', comment: 'Shorter.', suggestion: null },
    ],
  };

  async function renderReading() {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <AiReviewPanel exerciseId="ex-1" attemptId="att-1" templateCode="read_aloud" criteria={new Map()} />,
      );
    });
    return tree;
  }

  function howToLinks(tree: ReactTestRenderer.ReactTestRenderer) {
    return tree.root
      .findAllByType(Text)
      .filter(node => node.props.children === 'exerciseRunner.aiReview.readingCheck.pronunciation.howTo');
  }

  beforeEach(() => {
    mockCardProps.mockReset();
    mockTrainSound.mockReset();
    mockTrainAvailable = true;
  });

  it('names the weak words under the prompt, with a card link only where the sound is named', async () => {
    mockGetAiReview.mockResolvedValue(READING);
    const tree = await renderReading();
    const shown = texts(tree);

    expect(shown).toContain('exerciseRunner.aiReview.readingCheck.pronunciation.sounds');
    expect(shown).toContain('Keep the tongue flat.');
    expect(shown).toContain('Shorter.');
    expect(howToLinks(tree)).toHaveLength(1);
    expect(mockCardProps).not.toHaveBeenCalled();
  });

  // An uncoloured Text standing on its own is drawn black — on the dark theme the weak word and
  // «How to say it» vanished (OQ-S3 s19). Every text must carry a colour, its own or a parent's.
  it('draws every text of the reading review in a colour of the theme', async () => {
    mockGetAiReview.mockResolvedValue(READING);
    const tree = await renderReading();
    const colourOf = (style: unknown): unknown => {
      const flat = [style].flat(Infinity).filter(Boolean) as { color?: unknown }[];
      return flat.reduce<unknown>((c, x) => x.color ?? c, undefined);
    };
    const uncoloured = tree.root
      .findAllByType(Text)
      .filter(node => typeof node.props.children === 'string' && node.props.children.trim() !== '')
      .filter(node => {
        for (let at: typeof node | null = node; at !== null; at = at.parent) {
          if (at.type === Text && colourOf(at.props.style) !== undefined) return false;
        }
        return true;
      })
      .map(node => node.props.children as string);
    expect(uncoloured).toEqual([]);
  });

  it('opens the card over the screen, closes it on Back, and leaves for a session on Train', async () => {
    mockGetAiReview.mockResolvedValue(READING);
    const tree = await renderReading();

    await act(async () => howToLinks(tree)[0]!.props.onPress());
    const props = mockCardProps.mock.calls.at(-1)![0] as {
      atomId: string;
      onBack: () => void;
      onTrain?: (atomId: string) => void;
    };
    expect(props.atomId).toBe('nb:kj');

    await act(async () => props.onTrain!('nb:kj'));
    expect(mockTrainSound).toHaveBeenCalledWith('nb:kj');

    mockCardProps.mockReset();
    await act(async () => howToLinks(tree)[0]!.props.onPress());
    const again = mockCardProps.mock.calls.at(-1)![0] as { onBack: () => void };
    await act(async () => again.onBack());
    mockCardProps.mockReset();
    await act(async () => undefined);
    expect(mockCardProps).not.toHaveBeenCalled();
  });

  it('draws the card without Train where no navigator offers one', async () => {
    mockTrainAvailable = false;
    mockGetAiReview.mockResolvedValue(READING);
    const tree = await renderReading();

    await act(async () => howToLinks(tree)[0]!.props.onPress());
    expect(mockCardProps.mock.calls.at(-1)![0]).not.toHaveProperty('onTrain');
  });
});
