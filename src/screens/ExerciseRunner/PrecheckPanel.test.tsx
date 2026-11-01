import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { PrecheckPanel } from './PrecheckPanel';
import { parsePrecheckResult } from '../../api/precheck';

/**
 * What a rehearsal puts on screen (platform plan 84): the remarks of a text, the words heard of
 * a reading with the share of each passage read, a line where a limit stopped it — and under
 * every one the reminder that nothing was graded.
 */

jest.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars === undefined ? key : `${key} ${JSON.stringify(vars)}`,
    language: 'en',
  }),
}));

jest.mock('../../providers/ThemeProvider', () => ({
  useTheme: () => ({ colors: jest.requireActual('../../theme/colors').lightColors }),
}));

const result = (raw: object) => {
  const parsed = parsePrecheckResult({ attemptId: 'a', templateCode: 't', selfCheck: null, feedback: null, reading: null, ...raw });
  if (parsed === null) throw new Error('unreadable');
  return parsed;
};

const texts = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map((node) => node.props.children).flat(Infinity).join('|');

function render(element: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(element);
  });
  return tree;
}

describe('PrecheckPanel', () => {
  it('draws the remarks of a text under the «not a grade» reminder', () => {
    const tree = render(
      <PrecheckPanel
        result={result({
          ai: { status: 'ok' },
          feedback: {
            summary: 'Nesten riktig.',
            items: [{ kind: 'grammar', target: {}, original: 'jeg har gå', suggestion: 'jeg har gått', explanation: 'Perfektum.', atomRef: null, severity: 'major' }],
          },
          remaining: { exercise: 2, learnerCredits: null, learnerChecksApprox: 9 },
        })}
      />,
    );
    const all = texts(tree);
    expect(all).toContain('exerciseRunner.precheck.subtitle');
    expect(all).toContain('Nesten riktig.');
    expect(all).toContain('jeg har gå  →  jeg har gått');
    expect(all).toContain('Perfektum.');
    expect(all).toContain('exerciseRunner.precheck.left {"count":2}');
  });

  it('draws the words heard with their scores, and only the passages that were sent', () => {
    const tree = render(
      <PrecheckPanel
        result={result({
          ai: { status: 'ok' },
          feedback: { summary: '', items: [], words: [{ text: 'Hei', passageIndex: 1, accuracy: 91.4 }, { text: 'du', passageIndex: 1, accuracy: 40 }] },
          reading: {
            passPercent: 80,
            prompts: [
              { itemId: 'p0', percent: 0, passed: false, check: {} },
              { itemId: 'p1', percent: 100, passed: true, check: {} },
            ],
          },
        })}
        passageLabel={(i) => `Del ${i + 1}`}
        itemLabel={(id) => `Del ${id}`}
        heardItemIds={new Set(['p1'])}
      />,
    );
    const all = texts(tree);
    expect(all).toContain('Hei');
    expect(all).toContain('91');
    expect(all).toContain('40');
    expect(all).toContain('Del p1');
    expect(all).toContain('100');
    expect(all).not.toContain('Del p0');
  });

  it('says why nothing was asked when a limit is spent', () => {
    const tree = render(
      <PrecheckPanel
        result={result({
          ai: { status: 'refused', reason: 'exercise_limit', detail: null },
          remaining: { exercise: 0, learnerCredits: null, learnerChecksApprox: null },
        })}
      />,
    );
    expect(texts(tree)).toContain('exerciseRunner.precheck.line.exerciseLimit');
  });

  it('draws nothing where only the free half ran for a learner no model reads', () => {
    const tree = render(
      <PrecheckPanel result={result({ ai: { status: 'not_asked', reason: 'disabled' } })} />,
    );
    expect(tree.toJSON()).toBeNull();
  });
});
