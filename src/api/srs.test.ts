import { getSrsStats } from './srs';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;

describe('getSrsStats', () => {
  beforeEach(() => mockGet.mockReset());

  it('fetches /srs/stats/me and returns it as-is', async () => {
    const stats = {
      newCount: 1,
      learningCount: 2,
      reviewCount: 3,
      relearningCount: 0,
      suspendedCount: 0,
      dueNowCount: 12,
      reviewedTodayCount: 4,
    };
    mockGet.mockResolvedValue(stats);

    const result = await getSrsStats();

    expect(result).toEqual(stats);
    expect(mockGet).toHaveBeenCalledWith('/api/v1/srs/stats/me');
  });
});
