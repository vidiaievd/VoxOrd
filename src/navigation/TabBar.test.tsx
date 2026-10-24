import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { ThemeProvider } from '../providers/ThemeProvider';
import { TabBar } from './TabBar';

jest.mock('../hooks/useSettings', () => ({
  useSettings: () => ({ theme: 'dark', language: 'en' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function render(el: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ThemeProvider>{el}</ThemeProvider>);
  });
  return tree;
}

/** The outermost element of each tab — Pressable renders more than one layer with its props. */
const tabs = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll(
    n =>
      n.props.accessibilityRole === 'tab' &&
      n.parent?.props.accessibilityRole !== 'tab',
  );

describe('TabBar', () => {
  it('shows five tabs with the active one selected', () => {
    const tree = render(
      <TabBar activeTab="Practice" onTabPress={() => {}} badges={{}} />,
    );
    const found = tabs(tree);
    expect(found).toHaveLength(5);
    expect(found.map(t => t.props.accessibilityState.selected)).toEqual([
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it('caps the badge at 99+ and says the count in the tab label', () => {
    const tree = render(
      <TabBar
        activeTab="Today"
        onTabPress={() => {}}
        badges={{ Practice: 120, Notifications: 0 }}
      />,
    );
    const texts = tree.root.findAllByType(Text).map(n => n.props.children);
    expect(texts).toContain('99+');
    expect(texts).not.toContain('0');
    const practice = tabs(tree)[2];
    expect(practice.props.accessibilityLabel).toMatch(/, 120\b/);
  });

  it('reports the tab that was pressed', () => {
    const onTabPress = jest.fn();
    const tree = render(
      <TabBar activeTab="Today" onTabPress={onTabPress} badges={{}} />,
    );
    act(() => tabs(tree)[4].props.onPress());
    expect(onTabPress).toHaveBeenCalledWith('Profile');
  });
});
