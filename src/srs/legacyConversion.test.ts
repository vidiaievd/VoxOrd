import { FsrsAdapter } from './fsrs-adapter';
import {
  convertLegacyProgress,
  convertLegacyProgressWith,
  difficultyAnchors,
  type LegacyWordProgress,
} from './legacyConversion';
import { SSZ_FSRS_PROFILE } from './profiles';

const NOW = Date.parse('2026-07-28T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const engine = new FsrsAdapter();
const anchors = difficultyAnchors(engine, NOW);

function legacy(over: Partial<LegacyWordProgress> = {}): LegacyWordProgress {
  return {
    memoryStage: 3,
    nextReview: NOW + DAY,
    lastReviewed: NOW - DAY,
    reviewCount: 10,
    successCount: 8,
    ...over,
  };
}

function convert(over: Partial<LegacyWordProgress> = {}) {
  return convertLegacyProgress(legacy(over), anchors, SSZ_FSRS_PROFILE.id, NOW);
}

describe('difficultyAnchors', () => {
  it('reads the engine\'s own initial difficulties rather than hardcoding them', () => {
    // Matches the AGAIN row measured over HTTP in Step 8.1b.
    expect(anchors.hardest).toBeCloseTo(6.4133, 4);
    expect(anchors.easiest).toBeLessThan(anchors.hardest);
    expect(anchors.easiest).toBeGreaterThan(1);
  });
});

describe('convertLegacyProgress — no usable history', () => {
  const fresh = {
    state: 'NEW',
    stability: 0,
    difficulty: 0,
    dueAt: NOW,
    reps: 0,
    lapses: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    lastReviewedAt: null,
    profileId: SSZ_FSRS_PROFILE.id,
  };

  it('returns a fresh card for a stage-0 word', () => {
    expect(convert({ memoryStage: 0, reviewCount: 0, nextReview: null, lastReviewed: null }))
      .toEqual(fresh);
  });

  it('does not invent stability for a stage that was never actually reviewed', () => {
    // Inconsistent data: a stage above 0 with no review history. The review
    // history is treated as the authority.
    expect(convert({ memoryStage: 5, reviewCount: 0, lastReviewed: null })).toEqual(fresh);
    expect(convert({ memoryStage: 5, reviewCount: 4, lastReviewed: null })).toEqual(fresh);
    expect(convert({ memoryStage: 5, reviewCount: 0 })).toEqual(fresh);
  });

  it('ignores a stale nextReview when there is no history', () => {
    expect(convert({ memoryStage: 0, reviewCount: 0, nextReview: NOW - 5 * DAY }).dueAt).toBe(NOW);
  });
});

describe('convertLegacyProgress — state and learning steps', () => {
  it.each([
    [1, 'LEARNING', 1],
    [2, 'LEARNING', 2],
    [3, 'REVIEW', 0],
    [4, 'REVIEW', 0],
    [5, 'REVIEW', 0],
  ])('stage %i becomes %s', (stage, state, learningSteps) => {
    const card = convert({ memoryStage: stage });
    expect(card.state).toBe(state);
    expect(card.learningSteps).toBe(learningSteps);
  });

  it('clamps a stage outside the 0..5 range instead of trusting it', () => {
    expect(convert({ memoryStage: 99 }).stability).toBe(7);
    expect(convert({ memoryStage: -3 }).state).toBe('NEW');
  });
});

describe('convertLegacyProgress — stability', () => {
  it.each([
    [1, 1 / 24],
    [2, 8 / 24],
    [3, 1],
    [4, 3],
    [5, 7],
  ])('carries stage %i\'s earned interval across as stability in days', (stage, days) => {
    expect(convert({ memoryStage: stage }).stability).toBeCloseTo(days, 10);
  });

  it('schedules a converted card at roughly the interval the old engine had earned', () => {
    // The point of converting on stability: the word should not suddenly come
    // back far sooner or later than the 6-stage model had it.
    const card = convert({ memoryStage: 5, successCount: 10 });
    const reviewed = engine.review(card, 'GOOD', card.dueAt);
    expect(reviewed.scheduledDays).toBeGreaterThanOrEqual(7);
  });
});

describe('convertLegacyProgress — difficulty', () => {
  it('puts a never-missed word at the easiest anchor', () => {
    expect(convert({ reviewCount: 10, successCount: 10 }).difficulty).toBeCloseTo(anchors.easiest, 10);
  });

  it('puts an always-missed word at the hardest anchor', () => {
    expect(convert({ reviewCount: 10, successCount: 0 }).difficulty).toBeCloseTo(anchors.hardest, 10);
  });

  it('interpolates in between, monotonically', () => {
    const rates = [0, 2, 5, 8, 10].map(
      (s) => convert({ reviewCount: 10, successCount: s }).difficulty,
    );
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
    expect(new Set(rates).size).toBe(rates.length);
  });

  it('clamps a successCount larger than reviewCount rather than overshooting', () => {
    expect(convert({ reviewCount: 3, successCount: 99 }).difficulty)
      .toBeCloseTo(anchors.easiest, 10);
  });

  it('never produces a difficulty outside what the engine itself assigns', () => {
    for (let s = 0; s <= 10; s++) {
      const d = convert({ reviewCount: 10, successCount: s }).difficulty;
      expect(d).toBeGreaterThanOrEqual(anchors.easiest);
      expect(d).toBeLessThanOrEqual(anchors.hardest);
    }
  });
});

describe('convertLegacyProgress — schedule and counters', () => {
  it('keeps an overdue word overdue', () => {
    const overdue = NOW - 30 * DAY;
    expect(convert({ nextReview: overdue }).dueAt).toBe(overdue);
  });

  it('makes a reviewed word with no scheduled date due now', () => {
    expect(convert({ nextReview: null }).dueAt).toBe(NOW);
  });

  it('carries review counts across, counting misses as lapses', () => {
    const card = convert({ reviewCount: 10, successCount: 8 });
    expect(card.reps).toBe(10);
    expect(card.lapses).toBe(2);
  });

  it('preserves the last review timestamp, which FSRS schedules from', () => {
    const last = NOW - 4 * DAY;
    expect(convert({ lastReviewed: last }).lastReviewedAt).toBe(last);
  });

  it('stamps the profile so a later profile change is detectable', () => {
    expect(convert().profileId).toBe(SSZ_FSRS_PROFILE.id);
  });
});

describe('convertLegacyProgress — output is a usable card', () => {
  it('produces cards the engine can review without special-casing', () => {
    for (let stage = 0; stage <= 5; stage++) {
      for (const successCount of [0, 5, 10]) {
        const card = convert({ memoryStage: stage, successCount });
        const next = engine.review(card, 'GOOD', Math.max(card.dueAt, NOW));
        expect(Number.isFinite(next.stability)).toBe(true);
        expect(next.stability).toBeGreaterThan(0);
        expect(next.dueAt).toBeGreaterThanOrEqual(Math.max(card.dueAt, NOW));
        expect(next.reps).toBe(card.reps + 1);
      }
    }
  });

  it('convertLegacyProgressWith derives the anchors and profile from the engine', () => {
    expect(convertLegacyProgressWith(legacy(), engine, NOW)).toEqual(convert());
  });
});
