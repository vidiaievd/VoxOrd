import { enrollInCourse, getCatalog, getCatalogCourse } from './catalog';
import { apiClient } from './client';
import type { Container, ContainerItem } from './types';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

function course(id: string, overrides: Partial<Container> = {}): Container {
  return {
    id,
    slug: null,
    title: id,
    containerType: 'course',
    targetLanguage: 'nb',
    difficultyLevel: 'A2',
    visibility: 'public',
    currentPublishedVersionId: `v-${id}`,
    accessTier: 'public_free',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function item(itemId: string, position: number, itemType: ContainerItem['itemType'] = 'container'): ContainerItem {
  return {
    id: `i-${itemId}`,
    containerVersionId: 'v',
    position,
    itemType,
    itemId,
    isRequired: true,
    title: itemId,
    addedAt: '2026-01-01T00:00:00Z',
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('getCatalog', () => {
  it('reads every page of public courses and drops unpublished ones', async () => {
    mockGet
      .mockResolvedValueOnce({ items: [course('a'), course('b', { currentPublishedVersionId: null })], page: 1, totalPages: 2 })
      .mockResolvedValueOnce({ items: [course('c')], page: 2, totalPages: 2 });

    const list = await getCatalog();

    expect(list.map((c) => c.id)).toEqual(['a', 'c']);
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenNthCalledWith(1, '/api/v1/containers', {
      query: { visibility: 'public', containerType: 'course', limit: 100, page: 1 },
    });
  });
});

describe('getCatalogCourse', () => {
  it('returns the published units in order, without other items', async () => {
    mockGet
      .mockResolvedValueOnce(course('a'))
      .mockResolvedValueOnce([item('u2', 2), item('lesson', 0, 'lesson'), item('u1', 1)]);

    const detail = await getCatalogCourse('a');

    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/containers/a/versions/v-a/items');
    expect(detail.units.map((u) => u.itemId)).toEqual(['u1', 'u2']);
  });

  it('has no programme when nothing is published', async () => {
    mockGet.mockResolvedValueOnce(course('a', { currentPublishedVersionId: null }));
    const detail = await getCatalogCourse('a');
    expect(detail.units).toEqual([]);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

describe('enrollInCourse', () => {
  it('posts the container id', async () => {
    mockPost.mockResolvedValueOnce({ id: 'e1' });
    await enrollInCourse('a');
    expect(mockPost).toHaveBeenCalledWith('/api/v1/enrollments', { containerId: 'a' });
  });
});
