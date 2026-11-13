import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { emptyProsodyLayer, type ProsodyLayer } from '../../kernel/prosody';
import { ProsodyText, withAlpha } from './ProsodyText';
import { ProsodyLegend } from './ProsodyLegend';

jest.mock('../../i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));

jest.mock('../../providers/ThemeProvider', () => ({
  useTheme: () => ({ colors: jest.requireActual('../../theme/colors').lightColors }),
}));

const layer: ProsodyLayer = {
  ...emptyProsodyLayer(),
  stresses: [{ i: 1, w: 'heter', toneme: 1, vowel: { s: 1, e: 2, long: true }, source: 'lexicon' }],
};

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  return node
    .findAllByType(Text)
    .map((t) => React.Children.toArray(t.props.children).filter((c) => typeof c === 'string').join(''))
    .join('|');
}

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r;
}

describe('ProsodyText', () => {
  it('is one plain Text with no lens', () => {
    const r = render(<ProsodyText text="Jeg heter Anna" layer={layer} lens={null} fontSize={17} color="#000000" />);
    expect(r.root.findAllByType(Text)).toHaveLength(1);
    expect(textOf(r.root)).toBe('Jeg heter Anna');
  });

  it('draws the cross line over the stressed word and leaves the letters in place', () => {
    const r = render(<ProsodyText text="Jeg heter Anna" layer={layer} lens="stress" fontSize={17} color="#000000" />);
    const text = textOf(r.root);
    expect(text).toContain('×');
    // The word's own letters, however they are split into runs, read as the passage.
    expect(text.replace(/\|/g, '')).toContain('heter');
  });
});

describe('ProsodyLegend', () => {
  it.each(['stress', 'sounds', 'respell', 'melody'] as const)('renders the %s legend', (lens) => {
    const r = render(<ProsodyLegend lens={lens} />);
    expect(textOf(r.root)).toContain('prosody.legendTitle');
  });
});

describe('withAlpha', () => {
  it('turns hex into rgba and leaves other colours alone', () => {
    expect(withAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(withAlpha('#f00', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(withAlpha('red', 0.5)).toBe('red');
  });
});
