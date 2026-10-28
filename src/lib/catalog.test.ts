import type { Container } from '../api/types';
import {
  NO_FILTERS,
  catalogAccess,
  catalogPicks,
  defaultFilters,
  filterCatalog,
  filterChoices,
  groupCatalog,
} from './catalog';

function course(id: string, overrides: Partial<Container> = {}): Container {
  return {
    id,
    slug: null,
    title: id,
    containerType: 'course',
    targetLanguage: 'nb',
    difficultyLevel: 'A2',
    visibility: 'public',
    accessTier: 'public_free',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const list = [
  course('Ny i Norge', {
    description: 'Hverdag og jobb',
    learningGoals: ['Записаться к врачу'],
    tags: [
      { id: 't-read', name: 'Чтение', category: 'skill' },
      { id: 't-health', name: 'Здоровье', category: 'topic' },
    ],
  }),
  course('Norsk på jobben', {
    difficultyLevel: 'B1',
    tags: [{ id: 't-write', name: 'Письмо', category: 'skill' }],
  }),
  course('Nynorsk start', { targetLanguage: 'nn', difficultyLevel: 'A1' }),
  course('English basics', { targetLanguage: 'en', difficultyLevel: 'A1', accessTier: 'public_paid' }),
];

describe('defaultFilters', () => {
  it('starts on the current course language and level', () => {
    expect(defaultFilters(list[1])).toEqual({ query: '', lang: 'nb', level: 'B1', skill: null });
  });
  it('starts on nothing without a course', () => {
    expect(defaultFilters(null)).toBe(NO_FILTERS);
  });
});

describe('filterCatalog', () => {
  it('searches title and description, ignoring case', () => {
    expect(filterCatalog(list, { ...NO_FILTERS, query: 'JOBB' }).map((c) => c.id)).toEqual([
      'Ny i Norge',
      'Norsk på jobben',
    ]);
  });
  it('applies language and level together', () => {
    expect(filterCatalog(list, { ...NO_FILTERS, lang: 'nb', level: 'B1' }).map((c) => c.id)).toEqual([
      'Norsk på jobben',
    ]);
  });
  it('searches goals and tag names too', () => {
    expect(filterCatalog(list, { ...NO_FILTERS, query: 'врач' }).map((c) => c.id)).toEqual(['Ny i Norge']);
    expect(filterCatalog(list, { ...NO_FILTERS, query: 'здоров' }).map((c) => c.id)).toEqual(['Ny i Norge']);
  });
  it('keeps the courses carrying the skill tag', () => {
    expect(filterCatalog(list, { ...NO_FILTERS, skill: 't-write' }).map((c) => c.id)).toEqual([
      'Norsk på jobben',
    ]);
  });
  it('returns everything without filters', () => {
    expect(filterCatalog(list, NO_FILTERS)).toHaveLength(4);
  });
});

describe('groupCatalog', () => {
  it('groups by level, then language', () => {
    expect(groupCatalog(list).map((g) => `${g.lang}·${g.level}`)).toEqual([
      'en·A1',
      'nn·A1',
      'nb·A2',
      'nb·B1',
    ]);
  });
});

describe('filterChoices', () => {
  it('offers the languages and levels the catalogue holds', () => {
    const choices = filterChoices(list);
    expect(choices.langs).toEqual(['en', 'nb', 'nn']);
    expect(choices.levels).toEqual(['A1', 'A2', 'B1']);
  });
  it('offers only skill tags, by name', () => {
    expect(filterChoices(list).skills.map((t) => t.name)).toEqual(['Письмо', 'Чтение']);
  });
  it('offers no skills when no course has any', () => {
    expect(filterChoices(list.slice(2)).skills).toEqual([]);
  });
});

describe('catalogAccess', () => {
  it.each([
    ['public_free', 'enrol'],
    ['public_paid', 'paid'],
    ['entitlement_required', 'paid'],
    ['free_within_school', 'school'],
    ['assigned_only', 'school'],
    [undefined, 'enrol'],
  ] as const)('%s → %s', (tier, access) => {
    expect(catalogAccess(tier)).toBe(access);
  });
});

describe('catalogPicks', () => {
  it('leaves out held courses and keeps the level', () => {
    const picks = catalogPicks(list, new Set(['Nynorsk start']), 'A1');
    expect(picks.map((c) => c.id)).toEqual(['English basics']);
  });
  it('puts courses the learner can take first', () => {
    const picks = catalogPicks(list, new Set(), null);
    expect(picks.map((c) => c.id)).toEqual(['Norsk på jobben', 'Ny i Norge', 'Nynorsk start', 'English basics']);
  });
});
