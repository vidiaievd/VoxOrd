import type { SrsCard } from '../api/srs';

/** In-memory stand-in for the device's async storage. */
const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: () => ({
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
  }),
}));

jest.mock('../api/srs', () => ({
  reviewCard: jest.fn(),
}));

import { reviewCard } from '../api/srs';
import { reviewQueueStore } from './reviewQueueStore';
import { authStore } from './authStore';
import { ApiError } from '../api/client';

const LEARNER = { id: 'user-1', email: 'a@b.c', roles: ['student'] };
const OTHER = { id: 'user-2', email: 'x@y.z', roles: ['student'] };
const offline = () => new ApiError({ message: 'offline', status: null, code: 'NETWORK_ERROR' });

const mockReviewCard = reviewCard as jest.Mock;

const CARD: SrsCard = {
  id: 'card-1',
  userId: 'user-1',
  contentType: 'VOCABULARY_WORD',
  contentId: 'item-1',
  state: 'REVIEW',
  dueAt: '2026-08-14T10:00:00.000Z',
  stability: 5,
  difficulty: 5,
  scheduledDays: 7,
  reps: 3,
  lapses: 0,
  lastReviewedAt: '2026-08-07T10:00:00.000Z',
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-08-07T10:00:00.000Z',
  predicted: [],
};

beforeEach(() => {
  authStore.setSignedIn(LEARNER);
  mockStorage.clear();
  mockReviewCard.mockReset();
  mockReviewCard.mockResolvedValue(CARD);
});

describe('reviewQueueStore.submit', () => {
  it('sends the rating with an idempotency key', async () => {
    await reviewQueueStore.submit('card-1', 'GOOD');

    expect(mockReviewCard).toHaveBeenCalledTimes(1);
    const [cardId, body] = mockReviewCard.mock.calls[0];
    expect(cardId).toBe('card-1');
    expect(body.rating).toBe('GOOD');
    expect(body.idempotencyKey).toEqual(expect.any(String));
  });

  it('omits carryOnPastLimit unless the learner chose it', async () => {
    await reviewQueueStore.submit('card-1', 'GOOD');

    expect(mockReviewCard.mock.calls[0][1]).not.toHaveProperty('carryOnPastLimit');
  });

  it('carries the learner’s choice to keep going through to the server', async () => {
    await reviewQueueStore.submit('card-1', 'GOOD', new Date(), { carryOnPastLimit: true });

    expect(mockReviewCard.mock.calls[0][1]).toMatchObject({ carryOnPastLimit: true });
  });

  it('keeps the choice on a review that had to wait offline', async () => {
    // Both attempts `submit` makes die on the network, so the answer stays queued…
    mockReviewCard
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'));
    await reviewQueueStore.submit('card-1', 'GOOD', new Date(), { carryOnPastLimit: true });
    expect(reviewQueueStore.pendingCount).toBe(1);

    // …and must reach the server later with the same permission it was given,
    // or the cap refuses exactly the answers the learner already decided about.
    await reviewQueueStore.flush();

    expect(reviewQueueStore.pendingCount).toBe(0);
    const lastBody = mockReviewCard.mock.calls[mockReviewCard.mock.calls.length - 1][1];
    expect(lastBody).toMatchObject({ carryOnPastLimit: true });
  });
});

describe('reviewQueueStore and whose answers they are', () => {
  /** Leaves nothing queued for the next test, whoever's it is. */
  afterEach(async () => {
    mockReviewCard.mockReset();
    mockReviewCard.mockResolvedValue(CARD);
    for (const user of [LEARNER, OTHER]) {
      authStore.setSignedIn(user);
      await reviewQueueStore.flush();
    }
  });

  it('records who answered', async () => {
    mockReviewCard.mockRejectedValue(offline());

    await reviewQueueStore.submit('card-1', 'GOOD');

    expect(JSON.parse(mockStorage.get('queue')!)).toEqual([
      expect.objectContaining({ cardId: 'card-1', userId: 'user-1' }),
    ]);
  });

  it('keeps answers through a lost session and sends them when the same learner is back', async () => {
    mockReviewCard.mockRejectedValue(offline());
    await reviewQueueStore.submit('card-1', 'GOOD');

    authStore.setSignedOut();
    mockReviewCard.mockReset();
    mockReviewCard.mockResolvedValue(CARD);
    await reviewQueueStore.flush();
    expect(mockReviewCard).not.toHaveBeenCalled();

    authStore.setSignedIn(LEARNER);
    await reviewQueueStore.flush();
    expect(mockReviewCard).toHaveBeenCalledTimes(1);
    expect(reviewQueueStore.pendingCount).toBe(0);
  });

  it('never sends one learner’s answers in another learner’s session', async () => {
    mockReviewCard.mockRejectedValue(offline());
    await reviewQueueStore.submit('card-1', 'GOOD');

    authStore.setSignedIn(OTHER);
    mockReviewCard.mockReset();
    mockReviewCard.mockResolvedValue(CARD);
    await reviewQueueStore.flush();

    expect(mockReviewCard).not.toHaveBeenCalled();
    expect(reviewQueueStore.pendingCount).toBe(0);

    authStore.setSignedIn(LEARNER);
    expect(reviewQueueStore.pendingCount).toBe(1);
  });

  it('sends the other learner’s answers past one it must hold back', async () => {
    mockReviewCard.mockRejectedValue(offline());
    await reviewQueueStore.submit('card-1', 'GOOD');
    authStore.setSignedIn(OTHER);
    await reviewQueueStore.submit('card-2', 'HARD');

    mockReviewCard.mockReset();
    mockReviewCard.mockResolvedValue(CARD);
    await reviewQueueStore.flush();

    expect(mockReviewCard).toHaveBeenCalledTimes(1);
    expect(mockReviewCard.mock.calls[0][0]).toBe('card-2');
  });
});
