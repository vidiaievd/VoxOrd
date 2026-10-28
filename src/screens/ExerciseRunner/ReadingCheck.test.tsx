import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { AiReadingPrompt } from '../../api/aiReview';
import { ReadingCheck } from './ReadingCheck';

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

const PROMPT: AiReadingPrompt = {
  itemId: 'p1',
  transcript: 'jeg bor på oslo eh',
  ops: [
    { k: 'read', i: 0, n: 2, heard: 'jeg bor', focus: false },
    { k: 'misread', i: 2, expected: 'i', heard: 'på', focus: true },
    { k: 'read', i: 3, n: 1, heard: 'oslo', focus: false },
    { k: 'missed', i: 4, expected: 'nå', focus: false },
    { k: 'extra', heard: 'eh' },
  ],
  total: 5,
  read: 3,
  percent: 60,
  passed: false,
  pronunciation: null,
  wordsPerMinute: null,
};

async function render(props: Partial<React.ComponentProps<typeof ReadingCheck>>) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <ReadingCheck prompt={PROMPT} passPercent={85} {...props} />,
    );
  });
  /** The text of the outermost Text nodes, as a reader would see it. */
  const flat = (node: ReactTestRenderer.ReactTestInstance | string): string =>
    typeof node === 'string' ? node : node.children.map(flat).join('');
  const paragraphs = renderer.root
    .findAllByType(Text)
    .filter(t => t.parent?.type !== Text && !(t.parent?.parent?.type === Text))
    .map(flat);
  return { paragraphs };
}

describe('ReadingCheck (plan 82, step 12)', () => {
  it('lays the check over today’s passage, with its own punctuation', async () => {
    const { paragraphs } = await render({ passage: 'Jeg bor i Oslo nå.' });
    expect(paragraphs).toContain('Jeg bor i (på) Oslo nå +eh.');
    expect(paragraphs.join('\n')).toContain(
      'aiReview.readingCheck.count {"read":3,"total":5,"percent":60}',
    );
    expect(paragraphs.join('\n')).toContain('aiReview.readingCheck.mark {"percent":85}');
  });

  it('draws the words of the check when the passage was edited since', async () => {
    const { paragraphs } = await render({ passage: 'Jeg bor i Bergen.' });
    expect(paragraphs).toContain('jeg bor i (på) oslo nå +eh');
  });

  it('says only what it has: no pace, no pronunciation unless given', async () => {
    const without = await render({});
    expect(without.paragraphs.join('\n')).not.toContain('readingCheck.pace');
    expect(without.paragraphs.join('\n')).not.toContain('pronunciation.title');

    const withBoth = await render({
      prompt: {
        ...PROMPT,
        wordsPerMinute: 101.6,
        pronunciation: {
          accuracy: 80,
          fluency: 70,
          completeness: 90,
          prosody: null,
          words: [
            { text: 'Oslo', accuracy: 40, error: 'none' },
            { text: 'jeg', accuracy: 95, error: 'none' },
          ],
        },
      },
    });
    const all = withBoth.paragraphs.join('\n');
    expect(all).toContain('aiReview.readingCheck.pace {"wpm":102}');
    expect(all).toContain('aiReview.readingCheck.pronunciation.unclear Oslo');
  });
});
