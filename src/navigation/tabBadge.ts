/** The most a tab badge spells out; anything above reads «99+». */
export const BADGE_CAP = 99;

/** What a tab badge shows, or `null` for no badge — nothing due is no badge, not a «0». */
export function badgeText(count: number | null | undefined): string | null {
  if (count == null || count <= 0) return null;
  return count > BADGE_CAP ? `${BADGE_CAP}+` : String(count);
}

/** «Practice, 18 due» — the tab's name, then what its badge says in words. */
export function tabAccessibilityLabel(
  label: string,
  badgeWords: string | null,
): string {
  return badgeWords === null ? label : `${label}, ${badgeWords}`;
}
