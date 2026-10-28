import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { darkColors, lightColors } from '../../theme/colors';
import { Button } from './Button';
import { Card } from './Card';
import { NavHeader } from './NavHeader';
import { ProgressTrack } from './ProgressTrack';
import { SegmentedControl } from './SegmentedControl';
import { Tag } from './Tag';
import { withAlpha } from './color';

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

describe('ui primitives', () => {
  it('withAlpha turns a hex token into rgba', () => {
    expect(withAlpha('#9184d9', 0.12)).toBe('rgba(145, 132, 217, 0.12)');
  });

  it('Button is a labelled button, dims when disabled and does not fire', () => {
    const onPress = jest.fn();
    const tree = render(<Button label="Go" disabled onPress={onPress} />);
    const btn = tree.root.findByProps({ accessibilityRole: 'button' });
    expect(btn.props.accessibilityLabel).toBe('Go');
    expect(btn.props.accessibilityState).toEqual({ disabled: true });
    expect(btn.props.disabled).toBe(true);
    const inner = btn.findAll(n => n.props.style && flat(n)?.opacity === 0.45);
    expect(inner.length).toBeGreaterThan(0);
  });

  it('primary Button is outlined with the accent edge, never filled', () => {
    const tree = render(<Button label="Go" />);
    const box = tree.root.findAll(n => flat(n)?.borderWidth === 1)[0];
    expect(flat(box).borderColor).toBe(darkColors.accentBase);
    expect(flat(box).backgroundColor).toBe('transparent');
    expect(flat(box).height).toBe(48);
  });

  it('Card variants: plain fills surface, outline has the neutral800 edge, lit adds a gradient', () => {
    const plain = render(<Card variant="plain" />);
    expect(
      plain.root.findAll(n => flat(n)?.backgroundColor === darkColors.surface)
        .length,
    ).toBeGreaterThan(0);
    const outline = render(<Card variant="outline" />);
    expect(
      outline.root.findAll(n => flat(n)?.borderColor === darkColors.neutral800)
        .length,
    ).toBeGreaterThan(0);
    const lit = render(<Card variant="lit" />);
    expect(
      lit.root.findAllByProps({ testID: 'linear-gradient' }).length,
    ).toBeGreaterThan(0);
    expect(
      lit.root.findAll(n => flat(n)?.borderColor === darkColors.accent800)
        .length,
    ).toBeGreaterThan(0);
  });

  it('ProgressTrack clamps and reports a11y value', () => {
    const tree = render(<ProgressTrack value={1.7} />);
    expect(
      tree.root.findByProps({ accessibilityRole: 'progressbar' }).props
        .accessibilityValue.now,
    ).toBe(100);
    const none = render(<ProgressTrack value={NaN} />);
    expect(
      none.root.findByProps({ accessibilityRole: 'progressbar' }).props
        .accessibilityValue.now,
    ).toBe(0);
  });

  it('SegmentedControl exposes tablist/tab roles and reports selection', () => {
    const onChange = jest.fn();
    const tree = render(
      <SegmentedControl
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    expect(
      tree.root.findAllByProps({ accessibilityRole: 'tablist' }).length,
    ).toBeGreaterThan(0);
    const tabs = tree.root.findAll(
      n =>
        n.props.accessibilityRole === 'tab' &&
        typeof n.props.onPress === 'function',
    );
    expect(tabs[0].props.accessibilityState).toEqual({ selected: true });
    expect(tabs[1].props.accessibilityState).toEqual({ selected: false });
    act(() => tabs[1].props.onPress());
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('Tag variants take their colours from tokens', () => {
    const tree = render(<Tag label="x" variant="outline" />);
    expect(
      tree.root.findAll(n => flat(n)?.borderColor === darkColors.accent700)
        .length,
    ).toBeGreaterThan(0);
  });

  it('NavHeader is 48 high and calls back', () => {
    const onBack = jest.fn();
    const tree = render(<NavHeader parentLabel="Courses" onBack={onBack} />);
    expect(
      tree.root.findAll(n => flat(n)?.height === 48).length,
    ).toBeGreaterThan(0);
    act(() =>
      tree.root.findByProps({ accessibilityLabel: 'Courses' }).props.onPress(),
    );
    expect(onBack).toHaveBeenCalled();
  });

  it('both schemes carry different values for the same roles', () => {
    expect(lightColors.surface).not.toBe(darkColors.surface);
  });
});
