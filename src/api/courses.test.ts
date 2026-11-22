import { getMyHistory } from './courses';
import { apiClient, ApiError } from './client';

jest.mock('./client', () => {
  const actual = jest.requireActual('./client');
  return { ...actual, apiClient: { get: jest.fn() } };
});
const mockGet = apiClient.get as jest.Mock;

const enrollment = (id: string, status: string, completedAt: string | null = null) => ({
  id: `e-${id}`,
  containerId: id,
  status,
  completedAt,
});
const refused = (status: number | null) => new ApiError({ message: 'x', status });

describe('getMyHistory', () => {
  beforeEach(() => mockGet.mockReset());

  it('lists only completed enrolments, newest first, and keeps what is gone for the learner', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/v1/enrollments') {
        return [
          enrollment('active', 'ACTIVE'),
          enrollment('left', 'UNENROLLED'),
          enrollment('old', 'COMPLETED', '2026-01-01T00:00:00Z'),
          enrollment('shared', 'COMPLETED', '2026-11-01T00:00:00Z'),
          enrollment('deleted', 'COMPLETED', '2026-10-01T00:00:00Z'),
          enrollment('flaky', 'COMPLETED', '2026-09-01T00:00:00Z'),
        ];
      }
      const id = path.split('/').pop();
      if (id === 'shared') throw refused(403);
      if (id === 'deleted') throw refused(404);
      if (id === 'flaky') throw refused(null);
      return { id, title: id };
    });

    const items = await getMyHistory();

    expect(items.map(i => [i.enrollment.containerId, i.container?.id ?? null])).toEqual([
      ['shared', null],
      ['deleted', null],
      ['old', 'old'],
    ]);
  });
});
