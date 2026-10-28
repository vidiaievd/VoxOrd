import { badgeText, tabAccessibilityLabel } from './tabBadge';

describe('badgeText', () => {
  it('shows no badge when nothing is waiting or the count is unknown', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(-3)).toBeNull();
    expect(badgeText(null)).toBeNull();
    expect(badgeText(undefined)).toBeNull();
  });

  it('spells the count up to 99, then caps it', () => {
    expect(badgeText(1)).toBe('1');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
    expect(badgeText(4321)).toBe('99+');
  });
});

describe('tabAccessibilityLabel', () => {
  it('adds the badge in words after the tab name', () => {
    expect(tabAccessibilityLabel('Practice', '18 due')).toBe(
      'Practice, 18 due',
    );
    expect(tabAccessibilityLabel('Today', null)).toBe('Today');
  });
});
