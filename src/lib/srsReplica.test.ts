import type { ReplicaCard, SrsCard } from '../api/srs';
import { FsrsAdapter } from '../srs/fsrs-adapter';
import {
  applyLocalReview,
  countReview,
  dueRows,
  fromReplicaCard,
  localDay,
  mergeServerCard,
  quotaToday,
  toSrsCard,
  type ReplicaRow,
} from './srsReplica';

const engine = new FsrsAdapter();
const NOW = new Date(2026, 9, 15, 10, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function replicaCard(overrides: Partial<ReplicaCard> = {}): ReplicaCard {
  return {
    id: 'card-1',
    userId: 'user-1',
    contentType: 'VOCABULARY_WORD',
    contentId: 'item-1',
    state: 'REVIEW',
    dueAt: new Date(NOW - HOUR).toISOString(),
    stability: 5,
    difficulty: 5,
    scheduledDays: 5,
    reps: 3,
    lapses: 0,
    lastReviewedAt: new Date(NOW - 5 * DAY).toISOString(),
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-10-10T10:00:00.000Z',
    predicted: [],
    elapsedDays: 5,
    learningSteps: 0,
    ...overrides,
  };
}

function row(overrides: Partial<ReplicaRow> = {}): ReplicaRow {
  return { ...fromReplicaCard(replicaCard()), ...overrides };
}

describe('fromReplicaCard', () => {
  it('keeps every field the scheduler reads, with times as epoch ms', () => {
    expect(fromReplicaCard(replicaCard({ learningSteps: 1 }))).toEqual({
      cardId: 'card-1',
      contentId: 'item-1',
      state: 'REVIEW',
      stability: 5,
      difficulty: 5,
      dueAt: NOW - HOUR,
      elapsedDays: 5,
      scheduledDays: 5,
      learningSteps: 1,
      reps: 3,
      lapses: 0,
      lastReviewedAt: NOW - 5 * DAY,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-10-10T10:00:00.000Z',
    });
  });

  it('reads a card never reviewed', () => {
    expect(fromReplicaCard(replicaCard({ lastReviewedAt: null })).lastReviewedAt).toBeNull();
  });
});

describe('applyLocalReview', () => {
  it('reschedules as the engine does, so the word is not due again at once', () => {
    const before = row();
    const after = applyLocalReview(before, 'GOOD', NOW, engine);

    expect(after.dueAt).toBeGreaterThan(NOW);
    expect(after.reps).toBe(4);
    expect(after.lastReviewedAt).toBe(NOW);
    expect(after.cardId).toBe('card-1');
  });

  it('counts a lapse only for a card in review rated AGAIN, like the server', () => {
    expect(applyLocalReview(row(), 'AGAIN', NOW, engine).lapses).toBe(1);
    expect(applyLocalReview(row({ state: 'LEARNING' }), 'AGAIN', NOW, engine).lapses).toBe(0);
  });

  it('leaves a suspended card alone', () => {
    const suspended = row({ state: 'SUSPENDED' });
    expect(applyLocalReview(suspended, 'GOOD', NOW, engine)).toBe(suspended);
  });
});

describe('mergeServerCard', () => {
  it('takes the server numbers and keeps the scheduler fields it leaves out', () => {
    const local = row({ elapsedDays: 7, learningSteps: 1 });
    const server: SrsCard = {
      ...replicaCard({ stability: 9, dueAt: new Date(NOW + 9 * DAY).toISOString(), reps: 4 }),
    };

    const merged = mergeServerCard(local, server);

    expect(merged).toMatchObject({
      stability: 9,
      dueAt: NOW + 9 * DAY,
      reps: 4,
      elapsedDays: 7,
      learningSteps: 1,
    });
  });

  it('starts a row the copy did not have', () => {
    const merged = mergeServerCard(null, replicaCard({ id: 'card-9' }));
    expect(merged).toMatchObject({ cardId: 'card-9', elapsedDays: 0, learningSteps: 0 });
  });
});

describe('dueRows', () => {
  it('gives cards due by now, earliest first, without suspended ones, up to the limit', () => {
    const rows = [
      row({ cardId: 'later', dueAt: NOW + HOUR }),
      row({ cardId: 'b', dueAt: NOW - HOUR }),
      row({ cardId: 'a', dueAt: NOW - 2 * HOUR }),
      row({ cardId: 'suspended', dueAt: NOW - 3 * HOUR, state: 'SUSPENDED' }),
      row({ cardId: 'c', dueAt: NOW }),
    ];

    expect(dueRows(rows, NOW, 10).map(r => r.cardId)).toEqual(['a', 'b', 'c']);
    expect(dueRows(rows, NOW, 2).map(r => r.cardId)).toEqual(['a', 'b']);
  });
});

describe('toSrsCard', () => {
  it('gives the shape of a due card, without content, with local predictions', () => {
    const card = toSrsCard(row(), 'user-1', engine, NOW);

    expect(card).toMatchObject({
      id: 'card-1',
      userId: 'user-1',
      contentType: 'VOCABULARY_WORD',
      contentId: 'item-1',
      state: 'REVIEW',
      dueAt: new Date(NOW - HOUR).toISOString(),
      front: null,
      back: null,
    });
    expect(card.predicted.map(p => p.rating)).toEqual(['AGAIN', 'HARD', 'GOOD', 'EASY']);
  });

  it('predicts nothing for a suspended card', () => {
    expect(toSrsCard(row({ state: 'SUSPENDED' }), 'user-1', engine, NOW).predicted).toEqual([]);
  });
});

describe('the day budget', () => {
  const today = localDay(NOW);

  it('counts reviews against the day they were given on', () => {
    const quota = { dailyLimit: 200, reviewedToday: 10, day: today };
    expect(countReview(quota, NOW)).toEqual({ dailyLimit: 200, reviewedToday: 11, day: today });
  });

  it('starts a new day from one', () => {
    const quota = { dailyLimit: 200, reviewedToday: 10, day: localDay(NOW - DAY) };
    expect(countReview(quota, NOW)).toEqual({ dailyLimit: 200, reviewedToday: 1, day: today });
  });

  it('reads yesterday’s count as zero today', () => {
    expect(quotaToday({ dailyLimit: 200, reviewedToday: 50, day: localDay(NOW - DAY) }, NOW)).toEqual({
      reviewedToday: 0,
      dailyLimit: 200,
    });
    expect(quotaToday({ dailyLimit: 200, reviewedToday: 50, day: today }, NOW)).toEqual({
      reviewedToday: 50,
      dailyLimit: 200,
    });
  });
});
