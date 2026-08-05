import { getCourseHome } from './courseHome';
import { apiClient } from './client';
import type { Container, ContainerItem } from './types';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;

function container(overrides: Partial<Container> = {}): Container {
  return {
    id: 'course-1',
    slug: 'ny-i-norge',
    title: 'Ny i Norge',
    containerType: 'course',
    targetLanguage: 'no',
    difficultyLevel: 'A2',
    visibility: 'public',
    gatingMode: 'sequential',
    currentPublishedVersionId: 'version-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function unitItem(overrides: Partial<ContainerItem> = {}): ContainerItem {
  return {
    id: 'item-1',
    containerVersionId: 'version-1',
    position: 1,
    itemType: 'container',
    itemId: 'unit-1',
    isRequired: true,
    title: 'Leksjon 1',
    addedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function overlay(items: Array<Record<string, unknown>> = []) {
  return {
    containerId: 'course-1',
    totalItems: items.length,
    completedItems: items.filter((i) => i.status === 'COMPLETED').length,
    completionRatio: items.length
      ? items.filter((i) => i.status === 'COMPLETED').length / items.length
      : 0,
    items,
  };
}

/** Routes the two/three getCourseHome calls by which path is requested. */
function routeGet(handlers: Record<string, unknown>) {
  mockGet.mockImplementation(async (path: string) => {
    for (const [fragment, value] of Object.entries(handlers)) {
      if (path.includes(fragment)) return value;
    }
    throw new Error(`Unexpected request in test: ${path}`);
  });
}

describe('getCourseHome', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('marks a unit done once its required items are all completed', async () => {
    routeGet({
      '/progress/course/': overlay([
        { contentType: 'lesson', contentId: 'l1', status: 'COMPLETED', moduleId: 'unit-1', isRequired: true },
      ]),
      '/containers/course-1/versions/version-1/items': [unitItem()],
      '/containers/course-1': container(),
    });

    const result = await getCourseHome('course-1');

    expect(result.units).toEqual([
      { id: 'unit-1', position: 1, title: 'Leksjon 1', status: 'done', completedLessons: 1, totalLessons: 1 },
    ]);
    expect(result.progress.percentComplete).toBe(100);
  });

  it('sequential gating: first incomplete unit is active, later ones locked', async () => {
    routeGet({
      '/progress/course/': overlay([
        { contentType: 'lesson', contentId: 'l1', status: 'IN_PROGRESS', moduleId: 'unit-2', isRequired: true },
        { contentType: 'lesson', contentId: 'l2', status: 'NOT_STARTED', moduleId: 'unit-3', isRequired: true },
      ]),
      '/containers/course-1/versions/version-1/items': [
        unitItem({ id: 'item-1', position: 1, itemId: 'unit-1', title: 'Unit 1' }),
        unitItem({ id: 'item-2', position: 2, itemId: 'unit-2', title: 'Unit 2' }),
        unitItem({ id: 'item-3', position: 3, itemId: 'unit-3', title: 'Unit 3' }),
      ],
      '/containers/course-1': container({ gatingMode: 'sequential' }),
    });

    const result = await getCourseHome('course-1');

    // unit-1 has no rollup at all -> treated as complete -> 'done'.
    expect(result.units.map((u) => [u.id, u.status])).toEqual([
      ['unit-1', 'done'],
      ['unit-2', 'active'],
      ['unit-3', 'locked'],
    ]);
  });

  it('open gating: every incomplete unit is active, none locked', async () => {
    routeGet({
      '/progress/course/': overlay([
        { contentType: 'lesson', contentId: 'l1', status: 'NOT_STARTED', moduleId: 'unit-1', isRequired: true },
        { contentType: 'lesson', contentId: 'l2', status: 'NOT_STARTED', moduleId: 'unit-2', isRequired: true },
      ]),
      '/containers/course-1/versions/version-1/items': [
        unitItem({ id: 'item-1', position: 1, itemId: 'unit-1', title: 'Unit 1' }),
        unitItem({ id: 'item-2', position: 2, itemId: 'unit-2', title: 'Unit 2' }),
      ],
      '/containers/course-1': container({ gatingMode: 'open' }),
    });

    const result = await getCourseHome('course-1');

    expect(result.units.map((u) => [u.id, u.status])).toEqual([
      ['unit-1', 'active'],
      ['unit-2', 'active'],
    ]);
  });

  it('ignores progress items with no moduleId when rolling up units', async () => {
    routeGet({
      '/progress/course/': overlay([
        { contentType: 'lesson', contentId: 'course-level', status: 'COMPLETED', moduleId: null, isRequired: true },
      ]),
      '/containers/course-1/versions/version-1/items': [unitItem()],
      '/containers/course-1': container(),
    });

    const result = await getCourseHome('course-1');

    expect(result.units[0]).toMatchObject({ completedLessons: 0, totalLessons: 0, status: 'done' });
  });

  it('does not fetch items when the container has no published version', async () => {
    routeGet({
      '/progress/course/': overlay([]),
      '/containers/course-1': container({ currentPublishedVersionId: null }),
    });

    const result = await getCourseHome('course-1');

    expect(result.units).toEqual([]);
    expect(mockGet).not.toHaveBeenCalledWith(expect.stringContaining('/items'));
  });
});
