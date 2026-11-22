import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { HistorySection } from './HistorySection';

jest.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k} ${JSON.stringify(v)}` : k),
    language: 'en',
  }),
}));
jest.mock('../../providers/ThemeProvider', () => {
  const actual = jest.requireActual('../../theme/colors');
  return { useTheme: () => ({ colors: actual.lightColors, typography: { cardTitle: {}, meta: {} } }) };
});
jest.mock('../../components/ui', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    Overline: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
    PressableScale: Pressable,
  };
});

const row = (id: string, container: object | null) => ({
  enrollment: { id: `e-${id}`, completedAt: '2026-11-20T10:00:00Z' },
  container,
});

function render(items: unknown[], onOpen = jest.fn()) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<HistorySection items={items as never} onOpen={onOpen} />);
  });
  return { r, onOpen };
}

describe('HistorySection', () => {
  it('draws nothing without finished courses', () => {
    expect(render([]).r.toJSON()).toBeNull();
  });

  it('opens a readable course and only names one that is gone', () => {
    const { r, onOpen } = render([
      row('a', { id: 'course-a', title: 'Norsk B1', difficultyLevel: 'B1' }),
      row('b', null),
    ]);
    const text = JSON.stringify(r.toJSON());
    expect(text).toContain('Norsk B1');
    expect(text).toContain('coursesTab.historyUnavailable');
    expect(r.root.findAllByProps({ testID: 'history-unavailable' }).filter(n => typeof n.type === 'string')).toHaveLength(1);
    act(() => {
      r.root.findByProps({ accessibilityLabel: 'Norsk B1' }).props.onPress();
    });
    expect(onOpen).toHaveBeenCalledWith('course-a');
  });

  it('folds several gone courses into one row with their count', () => {
    const { r } = render([
      row('a', { id: 'course-a', title: 'Norsk B1', difficultyLevel: 'B1' }),
      row('b', null),
      row('c', null),
      row('d', null),
    ]);
    const rows = r.root.findAllByProps({ testID: 'history-unavailable' }).filter(n => typeof n.type === 'string');
    expect(rows).toHaveLength(1);
    const text = JSON.stringify(r.toJSON());
    expect(text).toContain('coursesTab.historyUnavailableCount {\\"count\\":3}');
    expect(text).toContain('coursesTab.historyUnavailableCountNote');
    expect(text).not.toContain('"coursesTab.historyUnavailable"');
  });
});
