import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { emptyProsodyLayer } from '../../kernel/prosody';
import { LessonSentenceDrill } from './LessonSentenceDrill';

jest.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars === undefined ? key : `${key} ${JSON.stringify(vars)}`,
  }),
}));

jest.mock('../../providers/ThemeProvider', () => ({
  useTheme: () => ({ colors: jest.requireActual('../../theme/colors').lightColors }),
}));

const layer = emptyProsodyLayer();
const layers = {
  0: { text: 'Jeg heter Anna. Jeg søker jobb.', layer, sounds: [] },
  2: { text: '## Hei på deg', layer, sounds: [] },
};

function texts(r: ReactTestRenderer.ReactTestRenderer): string {
  return r.root.findAllByType(Text).map(n => n.props.children).flat().join('|');
}

describe('LessonSentenceDrill', () => {
  it('walks the sentences of every paragraph in order and strips markdown signs', () => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      r = ReactTestRenderer.create(<LessonSentenceDrill layers={layers} lens="stress" />);
    });
    expect(texts(r)).toContain('{"n":1,"total":3}');
    const next = r.root.findByProps({ accessibilityLabel: 'prosody.drill.next' });
    act(() => next.props.onPress());
    act(() => r.root.findByProps({ accessibilityLabel: 'prosody.drill.next' }).props.onPress());
    expect(texts(r)).toContain('{"n":3,"total":3}');
    expect(r.root.findByProps({ accessibilityLabel: 'Hei på deg' })).toBeTruthy();
    expect(r.root.findByProps({ accessibilityLabel: 'prosody.drill.next' }).props.disabled).toBe(true);
  });

  it('draws nothing for layers without a word', () => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      r = ReactTestRenderer.create(
        <LessonSentenceDrill layers={{ 0: { text: '...', layer, sounds: [] } }} lens="stress" />,
      );
    });
    expect(r.toJSON()).toBeNull();
  });
});
