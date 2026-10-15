const mockGetDueCards = jest.fn();
jest.mock('../api/srs', () => ({ getDueCards: () => mockGetDueCards() }));

const mockDueQueue = jest.fn();
jest.mock('../services/vocabularyReplica', () => ({
  ...jest.requireActual('../services/vocabularyReplica'),
  vocabularyReplica: { dueQueue: () => mockDueQueue() },
}));

jest.mock('../repositories/CourseReviewRepository', () => ({
  courseReviewRepository: {
    getLinkedWords: async () => [
      { wordId: 5, deckId: 1, platformItemId: 'item-a' },
      { wordId: 6, deckId: 1, platformItemId: 'item-b' },
    ],
    getDeckTitles: async () => new Map([[1, 'Leksjon 1']]),
    getPaddingCandidates: async () => [],
  },
}));
jest.mock('../repositories/SrsReplicaRepository', () => ({ srsReplicaRepository: {} }));

import { ApiError } from '../api/client';
import { loadCourseReviewSets } from './courseReviewLoader';

const dueCard = (id: string, contentId: string, front: unknown) => ({
  id,
  userId: 'user-1',
  contentType: 'VOCABULARY_WORD',
  contentId,
  state: 'REVIEW',
  front,
  predicted: [],
});

beforeEach(() => {
  mockGetDueCards.mockReset();
  mockDueQueue.mockReset();
});

describe('loadCourseReviewSets', () => {
  it('reviews from the server queue when it answers', async () => {
    mockGetDueCards.mockResolvedValue({
      cards: [dueCard('c1', 'item-a', { word: 'hus', listId: 'l1' })],
      reviewedToday: 2,
      dailyLimit: 200,
    });

    const overview = await loadCourseReviewSets({ language: 'ru' });

    expect(overview.fromReplica).toBe(false);
    expect(overview.totalDue).toBe(1);
    expect(mockDueQueue).not.toHaveBeenCalled();
  });

  it('reviews from the phone copy when the server is out of reach', async () => {
    mockGetDueCards.mockRejectedValue(
      new ApiError({ message: 'offline', status: null, code: 'NETWORK_ERROR' }),
    );
    mockDueQueue.mockResolvedValue({
      cards: [dueCard('c1', 'item-a', null), dueCard('c2', 'item-b', null)],
      reviewedToday: 5,
      dailyLimit: 200,
    });

    const overview = await loadCourseReviewSets({ language: 'ru' });

    expect(overview).toMatchObject({ fromReplica: true, totalDue: 2, reviewedToday: 5 });
    expect(overview.sets[0].due.map(w => w.cardId)).toEqual(['c1', 'c2']);
  });

  it('keeps the network failure when no copy was ever taken', async () => {
    const offline = new ApiError({ message: 'offline', status: null, code: 'NETWORK_ERROR' });
    mockGetDueCards.mockRejectedValue(offline);
    mockDueQueue.mockResolvedValue(null);

    await expect(loadCourseReviewSets({ language: 'ru' })).rejects.toBe(offline);
  });

  it('lets a refusal from the server stand', async () => {
    const refused = new ApiError({ message: 'forbidden', status: 403 });
    mockGetDueCards.mockRejectedValue(refused);

    await expect(loadCourseReviewSets({ language: 'ru' })).rejects.toBe(refused);
    expect(mockDueQueue).not.toHaveBeenCalled();
  });
});
