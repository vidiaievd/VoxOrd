import type { ReplicaRow } from '../lib/srsReplica';

/** In-memory stand-in for the SQLite copy, keyed `userId:cardId`. */
const mockRows = new Map<string, ReplicaRow>();
const mockQuotas = new Map<string, { dailyLimit: number; reviewedToday: number; day: string; syncedAt: number }>();

jest.mock('../repositories/SrsReplicaRepository', () => ({
  srsReplicaRepository: {
    getAll: async (userId: string) =>
      [...mockRows.entries()].filter(([k]) => k.startsWith(`${userId}:`)).map(([, r]) => r),
    get: async (userId: string, cardId: string) => mockRows.get(`${userId}:${cardId}`) ?? null,
    put: async (userId: string, row: ReplicaRow) => {
      mockRows.set(`${userId}:${row.cardId}`, row);
    },
    replaceAll: async (userId: string, rows: ReplicaRow[], keep: Set<string>) => {
      for (const key of [...mockRows.keys()]) {
        const cardId = key.slice(userId.length + 1);
        if (key.startsWith(`${userId}:`) && !keep.has(cardId)) mockRows.delete(key);
      }
      for (const r of rows) if (!keep.has(r.cardId)) mockRows.set(`${userId}:${r.cardId}`, r);
    },
    getQuota: async (userId: string) => mockQuotas.get(userId) ?? null,
    putQuota: async (
      userId: string,
      quota: { dailyLimit: number; reviewedToday: number; day: string },
      syncedAt: number,
    ) => {
      mockQuotas.set(userId, { ...quota, syncedAt });
    },
  },
}));

const mockGetReplica = jest.fn();
jest.mock('../api/srs', () => ({
  getVocabularyReplica: () => mockGetReplica(),
}));

let mockPending = new Set<string>();
jest.mock('../store/reviewQueueStore', () => ({
  reviewQueueStore: { pendingCardIds: async () => mockPending },
}));

import { ApiError } from '../api/client';
import { authStore } from '../store/authStore';
import { localDay } from '../lib/srsReplica';
import { shouldUseReplica, vocabularyReplica } from './vocabularyReplica';

const USER = { id: 'user-1', email: 'a@b.c', roles: ['student'] };
const OTHER = { id: 'user-2', email: 'x@y.z', roles: ['student'] };
const HOUR = 60 * 60 * 1000;

function card(id: string, dueAt: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    userId: USER.id,
    contentType: 'VOCABULARY_WORD',
    contentId: `item-${id}`,
    state: 'REVIEW',
    dueAt: new Date(dueAt).toISOString(),
    stability: 5,
    difficulty: 5,
    scheduledDays: 5,
    reps: 3,
    lapses: 0,
    lastReviewedAt: new Date(dueAt - 5 * 24 * HOUR).toISOString(),
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
    predicted: [],
    elapsedDays: 5,
    learningSteps: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockRows.clear();
  mockQuotas.clear();
  mockPending = new Set();
  mockGetReplica.mockReset();
  authStore.setSignedIn(USER);
});

describe('vocabularyReplica', () => {
  it('has nothing to review from before the first refresh', async () => {
    expect(await vocabularyReplica.dueQueue()).toBeNull();
  });

  it('reviews from the copy the refresh took', async () => {
    const now = Date.now();
    mockGetReplica.mockResolvedValue({
      serverTime: new Date(now).toISOString(),
      reviewedToday: 7,
      dailyLimit: 200,
      cards: [card('a', now - HOUR), card('b', now + 10 * HOUR)],
    });

    await vocabularyReplica.refresh();
    const queue = await vocabularyReplica.dueQueue(now);

    expect(queue?.cards.map(c => c.id)).toEqual(['a']);
    expect(queue).toMatchObject({ reviewedToday: 7, dailyLimit: 200 });
  });

  it('keeps the local numbers of a card whose review has not reached the server', async () => {
    const now = Date.now();
    mockGetReplica.mockResolvedValue({
      serverTime: new Date(now).toISOString(),
      reviewedToday: 0,
      dailyLimit: 200,
      cards: [card('a', now - HOUR)],
    });
    await vocabularyReplica.refresh();
    await vocabularyReplica.recordReview('a', 'GOOD', new Date(now));
    const reviewed = mockRows.get('user-1:a')!;

    // The server has not seen the review yet and still says the card is due.
    mockPending = new Set(['a']);
    await vocabularyReplica.refresh();

    expect(mockRows.get('user-1:a')).toEqual(reviewed);
    expect((await vocabularyReplica.dueQueue(now))?.cards).toEqual([]);
  });

  it('takes a reviewed word out of the queue and counts it against the day', async () => {
    const now = Date.now();
    mockGetReplica.mockResolvedValue({
      serverTime: new Date(now).toISOString(),
      reviewedToday: 3,
      dailyLimit: 200,
      cards: [card('a', now - HOUR), card('b', now - HOUR)],
    });
    await vocabularyReplica.refresh();

    await vocabularyReplica.recordReview('a', 'GOOD', new Date(now));
    const queue = await vocabularyReplica.dueQueue(now);

    expect(queue?.cards.map(c => c.id)).toEqual(['b']);
    expect(queue?.reviewedToday).toBe(4);
    expect(mockQuotas.get(USER.id)?.day).toBe(localDay(now));
  });

  it('lets the server answer replace the preview', async () => {
    const now = Date.now();
    mockGetReplica.mockResolvedValue({
      serverTime: new Date(now).toISOString(),
      reviewedToday: 0,
      dailyLimit: 200,
      cards: [card('a', now - HOUR, { learningSteps: 1 })],
    });
    await vocabularyReplica.refresh();

    await vocabularyReplica.recordServerCard({
      ...card('a', now + 30 * 24 * HOUR, { stability: 30 }),
    } as never);

    expect(mockRows.get('user-1:a')).toMatchObject({ stability: 30, learningSteps: 1 });
  });

  it('never shows one learner the copy of another', async () => {
    const now = Date.now();
    mockGetReplica.mockResolvedValue({
      serverTime: new Date(now).toISOString(),
      reviewedToday: 0,
      dailyLimit: 200,
      cards: [card('a', now - HOUR)],
    });
    await vocabularyReplica.refresh();

    authStore.setSignedIn(OTHER);
    expect(await vocabularyReplica.dueQueue(now)).toBeNull();

    // Nor takes a server answer about someone else's card into it.
    await vocabularyReplica.recordServerCard(card('z', now) as never);
    expect(mockRows.has('user-2:z')).toBe(false);
  });

  it('drops a copy taken for a learner who signed out meanwhile', async () => {
    const now = Date.now();
    mockGetReplica.mockImplementation(async () => {
      authStore.setSignedIn(OTHER);
      return { serverTime: '', reviewedToday: 0, dailyLimit: 200, cards: [card('a', now)] };
    });

    await vocabularyReplica.refresh();

    expect(mockRows.size).toBe(0);
  });

  it('counts every due card, past the queue limit, and none before the first refresh', async () => {
    const now = Date.now();
    expect(await vocabularyReplica.dueCount(now)).toBeNull();

    mockGetReplica.mockResolvedValue({
      serverTime: new Date(now).toISOString(),
      reviewedToday: 0,
      dailyLimit: 200,
      cards: [
        ...Array.from({ length: 120 }, (_, i) => card(`d${i}`, now - HOUR)),
        card('later', now + HOUR),
        card('paused', now - HOUR, { state: 'SUSPENDED' }),
      ],
    });
    await vocabularyReplica.refresh();

    expect(await vocabularyReplica.dueCount(now)).toBe(120);
  });

  it('does nothing without a session', async () => {
    authStore.setSignedOut();
    await vocabularyReplica.refresh();
    expect(mockGetReplica).not.toHaveBeenCalled();
    expect(await vocabularyReplica.dueQueue()).toBeNull();
    expect(await vocabularyReplica.dueCount()).toBeNull();
  });
});

describe('shouldUseReplica', () => {
  it('falls back when the server is out of reach or down', () => {
    expect(shouldUseReplica(new ApiError({ message: '', status: null, code: 'NETWORK_ERROR' }))).toBe(true);
    expect(shouldUseReplica(new ApiError({ message: '', status: null, code: 'TIMEOUT' }))).toBe(true);
    expect(shouldUseReplica(new ApiError({ message: '', status: 503 }))).toBe(true);
  });

  it('lets a refusal stand', () => {
    expect(shouldUseReplica(new ApiError({ message: '', status: 403 }))).toBe(false);
    expect(shouldUseReplica(new Error('boom'))).toBe(false);
  });
});
