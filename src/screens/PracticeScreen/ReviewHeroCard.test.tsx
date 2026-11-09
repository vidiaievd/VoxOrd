import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { DueCount } from '../../hooks/useDueCount';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { ReviewHeroCard } from './ReviewHeroCard';

jest.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ theme: 'dark' }),
}));
jest.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars === undefined ? key : `${key} ${JSON.stringify(vars)}`,
    language: 'en',
  }),
}));

const due = (over: Partial<DueCount>): DueCount => ({
  count: 18,
  fromReplica: false,
  status: 'loaded',
  reviewedToday: null,
  refresh: async () => undefined,
  ...over,
});

function render(props: Partial<React.ComponentProps<typeof ReviewHeroCard>> = {}) {
  const onStart = jest.fn();
  const onRetry = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ThemeProvider>
        <ReviewHeroCard
          due={due({})}
          dailyLimit={0}
          reviewedToday={0}
          sources={{}}
          forecast={null}
          onStart={onStart}
          onRetry={onRetry}
          {...props}
        />
      </ThemeProvider>,
    );
  });
  return { tree, onStart, onRetry };
}

/** Every string drawn, joined — what a reader would see (and the mock's JSON vars). */
function collect(node: any): string[] {
  if (node == null) return [];
  if (typeof node === 'string') return [node];
  return (node.children ?? []).flatMap(collect);
}
const text = (tree: renderer.ReactTestRenderer) =>
  collect(tree.toJSON()).join('|') +
  tree.root
    .findAll(n => typeof n.type === 'string' && typeof n.props.accessibilityLabel === 'string')
    .map(n => '|' + n.props.accessibilityLabel)
    .join('');
const pressable = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll(
    n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  )[0];
const hasButton = (tree: renderer.ReactTestRenderer, prefix: string) =>
  tree.root.findAll(
    n =>
      typeof n.props.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.startsWith(prefix) &&
      typeof n.props.onPress === 'function',
  ).length > 0;

describe('ReviewHeroCard', () => {
  it('shows the due number and starts the session', () => {
    const { tree, onStart } = render();
    expect(text(tree)).toContain('18');
    const btn = tree.root.findAll(
      n =>
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('practice.reviewCta') &&
        typeof n.props.onPress === 'function',
    )[0];
    act(() => btn.props.onPress());
    expect(onStart).toHaveBeenCalled();
  });

  it('estimates minutes from the count', () => {
    const { tree } = render({ due: due({ count: 18 }) });
    expect(text(tree)).toContain('practice.reviewCta {"min":6}');
  });

  it('joins only the sources that have data', () => {
    const { tree } = render({ sources: { courseWords: 12, rules: null } });
    expect(text(tree)).toContain('practice.srcCourseWords {"count":12}');
    expect(text(tree)).not.toContain('srcRules');
  });

  it('hides today-of when there is no cap, shows it with one', () => {
    expect(text(render().tree)).not.toContain('practice.todayOf');
    expect(text(render({ dailyLimit: 20, reviewedToday: 5 }).tree)).toContain(
      'practice.todayOf {"done":5,"limit":20}',
    );
  });

  it('keeps the button when the quota is met', () => {
    const { tree } = render({ dailyLimit: 20, reviewedToday: 20 });
    expect(text(tree)).toContain('practice.reviewCta');
  });

  it('says the queue is empty and offers no button at zero', () => {
    const { tree } = render({ due: due({ count: 0 }) });
    expect(text(tree)).toContain('practice.queueEmpty');
    expect(text(tree)).not.toContain('practice.reviewCta');
  });

  it('offers a retry when the count is unknown', () => {
    const { tree, onRetry } = render({ due: due({ count: null, status: 'unavailable' }) });
    expect(text(tree)).toContain('practice.loadError');
    act(() => pressable(tree, 'courses.retry').props.onPress());
    expect(onRetry).toHaveBeenCalled();
    expect(hasButton(tree, 'practice.reviewCta')).toBe(false);
  });

  it('draws the forecast line only with data', () => {
    const now = new Date(2026, 9, 28, 12);
    const { tree } = render({
      forecast: [{ date: '2026-10-29', count: 9 }],
      now,
    });
    expect(text(tree)).toContain('practice.forecastOne');
    expect(text(render({ now }).tree)).not.toContain('forecast');
  });

  it('does not collapse to nothing while loading', () => {
    const { tree } = render({ due: due({ count: null, status: 'loading' }) });
    expect(tree.toJSON()).not.toBeNull();
    // The skeleton pulses on a loop; leaving it mounted keeps the worker alive.
    act(() => tree.unmount());
  });
});
