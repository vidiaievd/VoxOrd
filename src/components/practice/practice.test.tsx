import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { darkColors } from '../../theme/colors';
import { PhaseTracker, SessionHeader, StatStrip } from '.';

jest.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ theme: 'dark' }),
}));

function render(el: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ThemeProvider>{el}</ThemeProvider>);
  });
  return tree;
}

const flat = (node: any) => StyleSheet.flatten(node.props.style);

describe('PhaseTracker', () => {
  it('draws nothing for a single phase', () => {
    const tree = render(<PhaseTracker phases={['spelling']} index={0} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('colours done, current and ahead segments and labels each one', () => {
    const tree = render(
      <PhaseTracker phases={['preview', 'quiz', 'spelling']} index={1} />,
    );
    const segments = tree.root.findAll(
      n =>
        typeof n.type === 'string' &&
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessible,
    );
    expect(segments).toHaveLength(3);
    const bars = segments.map(s => flat(s.findAll(n => typeof n.type === 'string' && flat(n)?.height === 3)[0]));
    expect(bars.map(b => b.backgroundColor)).toEqual([
      darkColors.accent600,
      darkColors.accentBase,
      darkColors.neutral800,
    ]);
    expect(segments[1].props.accessibilityLabel).toMatch(/2.*3/);
  });
});

describe('SessionHeader', () => {
  it('leaves through the leading control and shows the counter', () => {
    const onLeading = jest.fn();
    const tree = render(
      <SessionHeader
        title="Review"
        leadingLabel="Close"
        onLeading={onLeading}
        counter="3/18"
      />,
    );
    const btn = tree.root.findByProps({ accessibilityLabel: 'Close' });
    act(() => btn.props.onPress());
    expect(onLeading).toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('3/18');
  });
});

describe('StatStrip', () => {
  it('labels each figure and splits the columns', () => {
    const tree = render(
      <StatStrip
        items={[
          { value: '18', label: 'cards' },
          { value: '04:10', label: 'time' },
          { value: '3', label: 'hard', accent: true },
        ]}
      />,
    );
    const cols = tree.root.findAll(n => typeof n.type === 'string' && n.props.accessible && n.props.accessibilityLabel,
    );
    expect(cols.map(c => c.props.accessibilityLabel)).toEqual([
      '18 cards',
      '04:10 time',
      '3 hard',
    ]);
    expect(flat(cols[0]).borderLeftWidth).toBe(0);
    expect(flat(cols[1]).borderLeftWidth).toBe(1);
  });
});
