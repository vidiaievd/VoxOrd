import type { AccessTier, Container, ContainerTag, DifficultyLevel, TagCategory } from '../api/types';

/**
 * The catalogue's client side (Courses spec §5.3): search, the language, level and skill chips,
 * grouping by «{language} · {level}», and what a course's screen may offer. The skill chip is
 * fed by `skill` tags (plan 04 step 9b); the «Offline» chip is not here — a course carries no
 * offline-pack flag (plan 04 step 9 notes).
 */

export interface CatalogFilters {
  query: string;
  lang: string | null;
  level: DifficultyLevel | null;
  /** A `skill` tag id. */
  skill: string | null;
}

export const NO_FILTERS: CatalogFilters = { query: '', lang: null, level: null, skill: null };

const LEVEL_ORDER: readonly DifficultyLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** The languages with a name in the UI strings (`catalog.lang.*`); others show their code. */
export const NAMED_LANGUAGES: readonly string[] = ['nb', 'nn', 'no', 'en', 'de', 'es', 'fr', 'uk', 'ru', 'ja'];

/** The chips start on the course being studied (spec §5.3), or on nothing. */
export function defaultFilters(current: Container | null): CatalogFilters {
  if (!current) return NO_FILTERS;
  return { query: '', lang: current.targetLanguage, level: current.difficultyLevel, skill: null };
}

/** A course's tags of the given categories, by name. */
export function tagsOf(c: Container, categories: readonly TagCategory[]): ContainerTag[] {
  return (c.tags ?? [])
    .filter((t) => categories.includes(t.category))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** What the search field matches: title, description, goals and tag names. */
function searchText(c: Container): string {
  return [c.title, c.description ?? '', ...(c.learningGoals ?? []), ...(c.tags ?? []).map((t) => t.name)]
    .join(' ')
    .toLowerCase();
}

export function filterCatalog(list: readonly Container[], f: CatalogFilters): Container[] {
  const q = f.query.trim().toLowerCase();
  return list.filter((c) => {
    if (f.lang && c.targetLanguage !== f.lang) return false;
    if (f.level && c.difficultyLevel !== f.level) return false;
    if (f.skill && !(c.tags ?? []).some((t) => t.id === f.skill)) return false;
    if (q && !searchText(c).includes(q)) return false;
    return true;
  });
}

export interface CatalogGroup {
  lang: string;
  level: DifficultyLevel;
  courses: Container[];
}

/** Groups in level order, then language; courses by title inside a group. */
export function groupCatalog(list: readonly Container[]): CatalogGroup[] {
  const byKey = new Map<string, CatalogGroup>();
  for (const c of list) {
    const key = `${c.targetLanguage}|${c.difficultyLevel}`;
    const group = byKey.get(key) ?? { lang: c.targetLanguage, level: c.difficultyLevel, courses: [] };
    group.courses.push(c);
    byKey.set(key, group);
  }
  const groups = [...byKey.values()];
  for (const g of groups) g.courses.sort((a, b) => a.title.localeCompare(b.title));
  return groups.sort(
    (a, b) =>
      LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || a.lang.localeCompare(b.lang),
  );
}

/**
 * The choices a chip's sheet offers: the values the catalogue holds, in a stable order.
 * No skill tags anywhere → no skill chip.
 */
export function filterChoices(list: readonly Container[]): {
  langs: string[];
  levels: DifficultyLevel[];
  skills: ContainerTag[];
} {
  const langs = [...new Set(list.map((c) => c.targetLanguage))].sort();
  const present = new Set(list.map((c) => c.difficultyLevel));
  const skills = new Map<string, ContainerTag>();
  for (const c of list) for (const t of tagsOf(c, ['skill'])) skills.set(t.id, t);
  return {
    langs,
    levels: LEVEL_ORDER.filter((l) => present.has(l)),
    skills: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * What the course screen may offer. learning-service lets a learner enrol on their own only in
 * a `public_free` course; a paid one is shown but cannot be taken until billing exists (owner's
 * decision 2026-10-28), and a school's course comes through the school.
 */
export type CatalogAccess = 'enrol' | 'paid' | 'school';

export function catalogAccess(tier: AccessTier | undefined): CatalogAccess {
  switch (tier) {
    case 'public_paid':
    case 'entitlement_required':
      return 'paid';
    case 'free_within_school':
    case 'assigned_only':
      return 'school';
    default:
      return 'enrol';
  }
}

/**
 * Today's block 12: courses the learner does not hold yet, at the level of the course they
 * study (owner's decision 2026-10-28 — there is no learner level), those they can take first.
 */
export function catalogPicks(
  list: readonly Container[],
  enrolledIds: ReadonlySet<string>,
  level: DifficultyLevel | null,
  limit = 6,
): Container[] {
  return list
    .filter((c) => !enrolledIds.has(c.id) && (!level || c.difficultyLevel === level))
    .sort(
      (a, b) =>
        Number(catalogAccess(a.accessTier) !== 'enrol') - Number(catalogAccess(b.accessTier) !== 'enrol') ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit);
}
