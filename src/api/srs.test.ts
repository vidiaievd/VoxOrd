import {
  getDueCards,
  getSrsStats,
  predictedByRating,
  reviewCard,
  vocabularyCards,
  type SrsCard,
} from './srs';
import { apiClient } from './client';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

function makeCard(overrides: Partial<SrsCard> = {}): SrsCard {
  return {
    id: 'card-1',
    userId: 'user-1',
    contentType: 'VOCABULARY_WORD',
    contentId: 'item-1',
    state: 'REVIEW',
    dueAt: '2026-07-27T10:00:00.000Z',
    stability: 5,
    difficulty: 5,
    scheduledDays: 3,
    reps: 2,
    lapses: 0,
    lastReviewedAt: null,
    createdAt: '2026-07-20T10:00:00.000Z',
    updatedAt: '2026-07-24T10:00:00.000Z',
    predicted: [],
    front: {
      word: 'hus',
      partOfSpeech: 'noun',
      ipaTranscription: null,
      audioMediaId: null,
      listId: 'list-1',
    },
    ...overrides,
  };
}

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

describe('getDueCards', () => {
  beforeEach(() => mockGet.mockReset());

  it('requests the bare path when no options are given', async () => {
    mockGet.mockResolvedValue({ cards: [], reviewedToday: 0, dailyLimit: 200, streakDays: 0 });

    await getDueCards();

    expect(mockGet).toHaveBeenCalledWith('/api/v1/srs/due');
  });

  it('passes limit, language and includeExamples as query params', async () => {
    mockGet.mockResolvedValue({ cards: [], reviewedToday: 0, dailyLimit: 200, streakDays: 0 });

    await getDueCards({ limit: 30, language: 'ru', includeExamples: true });

    expect(mockGet).toHaveBeenCalledWith('/api/v1/srs/due?limit=30&language=ru&includeExamples=true');
  });

  it('omits includeExamples when false rather than sending the string "false"', async () => {
    mockGet.mockResolvedValue({ cards: [], reviewedToday: 0, dailyLimit: 200, streakDays: 0 });

    await getDueCards({ language: 'en', includeExamples: false });

    expect(mockGet).toHaveBeenCalledWith('/api/v1/srs/due?language=en');
  });
});

describe('reviewCard', () => {
  beforeEach(() => mockPost.mockReset());

  it('posts the rating to the card review path', async () => {
    const card = makeCard();
    mockPost.mockResolvedValue(card);

    const result = await reviewCard('card-1', {
      rating: 'GOOD',
      reviewedAt: '2026-07-27T11:00:00.000Z',
      idempotencyKey: 'key-1',
    });

    expect(mockPost).toHaveBeenCalledWith('/api/v1/srs/cards/card-1/review', {
      rating: 'GOOD',
      reviewedAt: '2026-07-27T11:00:00.000Z',
      idempotencyKey: 'key-1',
    });
    expect(result).toBe(card);
  });
});

describe('vocabularyCards', () => {
  it('keeps vocabulary cards that have resolved content', () => {
    const card = makeCard();
    expect(vocabularyCards([card])).toEqual([card]);
  });

  it('drops exercise cards — the queue is the user’s global one', () => {
    const exercise = makeCard({ id: 'card-2', contentType: 'EXERCISE', front: null });
    expect(vocabularyCards([exercise])).toEqual([]);
  });

  it('drops vocabulary cards whose content lookup failed server-side', () => {
    const unresolved = makeCard({ id: 'card-3', front: null });
    expect(vocabularyCards([unresolved])).toEqual([]);
  });
});

describe('predictedByRating', () => {
  it('maps each predicted interval to its label', () => {
    const card = makeCard({
      predicted: [
        { rating: 'AGAIN', scheduledDays: 0, label: '<10 min' },
        { rating: 'GOOD', scheduledDays: 3, label: '3 d' },
      ],
    });

    expect(predictedByRating(card)).toEqual({ AGAIN: '<10 min', GOOD: '3 d' });
  });

  it('returns an empty map for a card with no predictions (the review response)', () => {
    expect(predictedByRating(makeCard({ predicted: [] }))).toEqual({});
  });
});
