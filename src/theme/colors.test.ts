import { darkColors, lightColors, NOCTURNE_KEYS } from './colors';

const HEX = /^#[0-9a-f]{6}$/i;

describe('Nocturne tokens', () => {
  it.each([
    ['dark', darkColors],
    ['light', lightColors],
  ])('%s scheme defines every Nocturne key as a hex colour', (_n, scheme) => {
    for (const key of NOCTURNE_KEYS) {
      expect(scheme[key]).toMatch(HEX);
    }
  });

  it.each([
    ['dark', darkColors],
    ['light', lightColors],
  ])('%s scheme uses neither pure black nor pure white', (_n, scheme) => {
    for (const key of NOCTURNE_KEYS) {
      expect(['#000000', '#ffffff']).not.toContain(scheme[key].toLowerCase());
    }
  });

  it('exposes the Nocturne accent as accentBase', () => {
    expect(darkColors.accentBase).toBe('#9184d9');
    expect(lightColors.accentBase).toBe('#796cbf');
    expect(darkColors.accent).toBe('#7c74ff');
  });

  it('mirrors the ramps between schemes', () => {
    expect(lightColors.accent900).not.toBe(darkColors.accent900);
    expect(lightColors.accent800).toBe('#e1ddfb');
    expect(darkColors.accent800).toBe('#423a6a');
  });
});
