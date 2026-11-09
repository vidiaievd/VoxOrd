import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { darkColors } from '../../theme/colors';
import { SettingsGroup } from './SettingsGroup';
import { SettingsRow } from './SettingsRow';
import { SubScreen } from './SubScreen';
import { Toggle } from './Toggle';

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

describe('settings primitives', () => {
  it('Toggle is a switch, flips on press and is dimmed when disabled', () => {
    const onChange = jest.fn();
    const tree = render(<Toggle value={false} onChange={onChange} />);
    const sw = tree.root.findByProps({ accessibilityRole: 'switch' });
    expect(sw.props.accessibilityState).toEqual({
      checked: false,
      disabled: false,
    });
    act(() => sw.props.onPress());
    expect(onChange).toHaveBeenCalledWith(true);

    const off = render(<Toggle value disabled onChange={onChange} />);
    const track = off.root.findAll(n => flat(n)?.width === 46)[0];
    expect(flat(track).opacity).toBe(0.45);
    expect(flat(track).borderColor).toBe(darkColors.accentBase);
  });

  it('toggle row flips from anywhere on the row', () => {
    const onChange = jest.fn();
    const tree = render(
      <SettingsRow
        type="toggle"
        icon="Bell"
        label="Sound"
        value
        onChange={onChange}
      />,
    );
    const row = tree.root.findAll(n => n.props.accessible === false)[0];
    act(() => row.props.onPress());
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('navigate row shows the value and fires onPress; value row is not pressable', () => {
    const onPress = jest.fn();
    const nav = render(
      <SettingsRow
        type="navigate"
        icon="Bell"
        label="Goal"
        value="10"
        onPress={onPress}
      />,
    );
    nav.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    expect(onPress).toHaveBeenCalled();
    expect(
      nav.root.findAll(n => n.children?.includes?.('10')).length,
    ).toBeGreaterThan(0);

    const val = render(
      <SettingsRow type="value" icon="Info" label="Version" value="1.0" />,
    );
    expect(
      val.root.findAllByProps({ accessibilityRole: 'button' }),
    ).toHaveLength(0);
  });

  it('radio row reports checked and shows the tick only when checked', () => {
    const on = render(
      <SettingsRow
        type="radio"
        icon="GlobeSimple"
        label="ru"
        checked
        onPress={() => {}}
      />,
    );
    expect(
      on.root.findByProps({ accessibilityRole: 'radio' }).props
        .accessibilityState,
    ).toEqual({
      checked: true,
    });
    const iconsOn = on.root.findAll(
      n => typeof n.type === 'function' && (n.type as any).name === 'Icon',
    );
    const off = render(
      <SettingsRow
        type="radio"
        icon="GlobeSimple"
        label="ru"
        checked={false}
        onPress={() => {}}
      />,
    );
    const iconsOff = off.root.findAll(
      n => typeof n.type === 'function' && (n.type as any).name === 'Icon',
    );
    expect(iconsOn.length).toBe(iconsOff.length + 1);
  });

  it('segmented row marks the active option and reports a change', () => {
    const onChange = jest.fn();
    const tree = render(
      <SettingsRow
        type="segmented"
        icon="Palette"
        label="Theme"
        value="dark"
        onChange={onChange}
        options={[
          { value: 'system', label: 'System', icon: 'CircleHalf' },
          { value: 'dark', label: 'Dark', icon: 'Moon' },
        ]}
      />,
    );
    const tabs = tree.root.findAll(
      n => typeof n.type === 'string' && n.props.accessibilityRole === 'tab',
    );
    expect(tabs.map(t => t.props.accessibilityState.selected)).toEqual([
      false,
      true,
    ]);
    const first = tree.root.findAllByProps({ accessibilityRole: 'tab' })[0];
    act(() => first.props.onPress());
    expect(onChange).toHaveBeenCalledWith('system');
  });

  it('only rows after the first get a divider', () => {
    const tree = render(
      <SettingsGroup title="Group" note="Small print">
        <SettingsRow isFirst type="check" icon="Check" label="A" />
        <SettingsRow type="check" icon="Check" label="B" />
      </SettingsGroup>,
    );
    const dividers = tree.root.findAll(
      n =>
        typeof n.type === 'string' &&
        flat(n)?.borderTopWidth === 1 &&
        flat(n)?.borderTopColor === darkColors.neutral800,
    );
    expect(dividers).toHaveLength(1);
  });

  it('SubScreen back button carries the parent label and goes back', () => {
    const onBack = jest.fn();
    const tree = render(
      <SubScreen backLabel="Profile" onBack={onBack} title="Settings" />,
    );
    const back = tree.root.findByProps({ accessibilityLabel: 'Profile' });
    act(() => back.props.onPress());
    expect(onBack).toHaveBeenCalled();
    expect(
      tree.root.findByProps({ accessibilityRole: 'header' }).props.children,
    ).toBe('Settings');
  });
});
