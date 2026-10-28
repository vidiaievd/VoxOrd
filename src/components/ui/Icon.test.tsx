import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Icon, ICON_NAMES } from './Icon';

describe('Icon', () => {
  it('passes size, colour and weight to the Phosphor glyph', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <Icon name="Bell" size={25} color="#abcdef" weight="fill" />,
      );
    });
    const glyph = tree.root.findByProps({ testID: 'icon-Bell' });
    expect(glyph.props).toMatchObject({
      size: 25,
      color: '#abcdef',
      weight: 'fill',
    });
  });

  it('defaults to regular weight and the text colour', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Icon name="CaretRight" />);
    });
    const glyph = tree.root.findByProps({ testID: 'icon-CaretRight' });
    expect(glyph.props.weight).toBe('regular');
    expect(glyph.props.size).toBe(20);
  });

  it('keeps streak imagery out of the icon set', () => {
    expect(ICON_NAMES).not.toContain('Flame');
  });
});
