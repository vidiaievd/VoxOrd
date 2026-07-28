import { FsrsAdapter } from './fsrs-adapter';
import type { SrsCard, SrsRating, SrsState } from './engine.port';
import { SSZ_FSRS_PROFILE } from './profiles';
import goldenVectors from './serverGoldenVectors.json';

/**
 * Engine parity: mobile must schedule identically to learning-service.
 *
 * `serverGoldenVectors.json` was produced by running the server's own
 * `FsrsScheduler` class (ssz-platform `78218cf`) — not a reimplementation of it
 * — over every rating sequence of depth 3 starting from a fresh card. So these
 * vectors exercise the server's card mapping as well as its parameters, which
 * is where a wrapper realistically goes wrong (a dropped `last_review`, a
 * misnamed `learning_steps`, a Date/epoch mix-up).
 *
 * Regenerating them is a deliberate act: it means the server's scheduling
 * changed, and a changed schedule needs a new profile id, not a new fixture.
 */

interface GoldenVector {
  path: string[];
  input: {
    state: string;
    stability: number;
    difficulty: number;
    dueAt: string;
    reps: number;
    lapses: number;
    elapsedDays: number;
    scheduledDays: number;
    learningSteps: number;
    lastReviewedAt: string | null;
  };
  reviewedAt: string;
  rating: string;
  output: {
    state: string;
    dueAt: string;
    stability: number;
    difficulty: number;
    elapsedDays: number;
    scheduledDays: number;
    learningSteps: number;
  };
  retrievabilityAtDue: number;
  predictedAtDue: Array<{ rating: string; scheduledDays: number; label: string }>;
}

const fixture = goldenVectors as {
  profileId: string;
  /** learning-service's own SSZ_FSRS_PROFILE, exported verbatim when the vectors were captured. */
  serverProfile: typeof SSZ_FSRS_PROFILE;
  vectors: GoldenVector[];
};

function toCard(input: GoldenVector['input'], profileId: string): SrsCard {
  return {
    state: input.state as SrsState,
    stability: input.stability,
    difficulty: input.difficulty,
    dueAt: Date.parse(input.dueAt),
    reps: input.reps,
    lapses: input.lapses,
    elapsedDays: input.elapsedDays,
    scheduledDays: input.scheduledDays,
    learningSteps: input.learningSteps,
    lastReviewedAt: input.lastReviewedAt === null ? null : Date.parse(input.lastReviewedAt),
    profileId,
  };
}

describe('FsrsAdapter — parity with learning-service', () => {
  const engine = new FsrsAdapter();

  /**
   * The vectors below only exercise the weights that a depth-3 walk from a
   * fresh card happens to reach, so they cannot catch a drift in every one of
   * the 21 weights on their own. This compares the whole profile directly
   * against the server's.
   */
  it('mirrors learning-service\'s profile parameter for parameter', () => {
    expect(SSZ_FSRS_PROFILE).toEqual(fixture.serverProfile);
  });

  it('captured the fixture under the same profile the engine runs', () => {
    expect(fixture.profileId).toBe(SSZ_FSRS_PROFILE.id);
    expect(engine.profileId).toBe(SSZ_FSRS_PROFILE.id);
    // Guards against a silently truncated fixture.
    expect(fixture.vectors).toHaveLength(84);
  });

  it.each(fixture.vectors.map((v) => [v.path.join('→'), v] as const))(
    'reproduces the server schedule for %s',
    (_name, vector) => {
      const card = toCard(vector.input, SSZ_FSRS_PROFILE.id);
      const next = engine.review(card, vector.rating as SrsRating, Date.parse(vector.reviewedAt));

      expect(next.state).toBe(vector.output.state);
      expect(new Date(next.dueAt).toISOString()).toBe(vector.output.dueAt);
      expect(next.stability).toBeCloseTo(vector.output.stability, 10);
      expect(next.difficulty).toBeCloseTo(vector.output.difficulty, 10);
      expect(next.elapsedDays).toBe(vector.output.elapsedDays);
      expect(next.scheduledDays).toBe(vector.output.scheduledDays);
      expect(next.learningSteps).toBe(vector.output.learningSteps);
    },
  );

  it.each(fixture.vectors.map((v) => [v.path.join('→'), v] as const))(
    'reproduces the server retrievability and predictions after %s',
    (_name, vector) => {
      const card = toCard(vector.input, SSZ_FSRS_PROFILE.id);
      const next = engine.review(card, vector.rating as SrsRating, Date.parse(vector.reviewedAt));

      expect(engine.retrievability(next, next.dueAt)).toBeCloseTo(vector.retrievabilityAtDue, 10);

      const predictions = engine.predict(next, next.dueAt);
      expect(predictions.map((p) => p.rating)).toEqual(['AGAIN', 'HARD', 'GOOD', 'EASY']);
      expect(predictions.map((p) => p.scheduledDays)).toEqual(
        vector.predictedAtDue.map((p) => p.scheduledDays),
      );
    },
  );
});

describe('FsrsAdapter — behaviour observed over HTTP', () => {
  const engine = new FsrsAdapter();
  const t0 = Date.parse('2026-07-28T09:00:00.000Z');

  /**
   * Step 8.1b measured this spread by curl-ing the live gateway against a real
   * NEW card. Asserting it here ties the local engine to behaviour that was
   * actually observed end-to-end, not only to the fixture above.
   */
  it.each([
    ['AGAIN', 'LEARNING', 0.212],
    ['HARD', 'LEARNING', 1.2931],
    ['GOOD', 'LEARNING', 2.3065],
    ['EASY', 'REVIEW', 8.2956],
  ] as Array<[SrsRating, SrsState, number]>)(
    'first review of a NEW card rated %s → %s',
    (rating, state, stability) => {
      const next = engine.review(engine.introduce(t0), rating, t0);
      expect(next.state).toBe(state);
      expect(next.stability).toBeCloseTo(stability, 4);
    },
  );

  it('sends EASY straight past the learning phase to ~8 days', () => {
    const next = engine.review(engine.introduce(t0), 'EASY', t0);
    expect(next.scheduledDays).toBe(8);
  });
});

describe('FsrsAdapter — card bookkeeping', () => {
  const engine = new FsrsAdapter();
  const t0 = Date.parse('2026-07-28T09:00:00.000Z');

  it('introduces a card that is due immediately and never reviewed', () => {
    const card = engine.introduce(t0);
    expect(card).toEqual({
      state: 'NEW',
      stability: 0,
      difficulty: 0,
      dueAt: t0,
      reps: 0,
      lapses: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      learningSteps: 0,
      lastReviewedAt: null,
      profileId: SSZ_FSRS_PROFILE.id,
    });
  });

  it('gives a NEW card no retrievability, since it has no forgetting curve yet', () => {
    expect(engine.retrievability(engine.introduce(t0), t0)).toBe(0);
  });

  it('counts a lapse only for a REVIEW-state card rated AGAIN', () => {
    // Straight to REVIEW state, matching the measured EASY behaviour above.
    const inReview = engine.review(engine.introduce(t0), 'EASY', t0);
    expect(inReview.state).toBe('REVIEW');
    expect(inReview.lapses).toBe(0);

    const lapsed = engine.review(inReview, 'AGAIN', inReview.dueAt);
    expect(lapsed.lapses).toBe(1);
  });

  it('does not count a lapse when a LEARNING card is rated AGAIN', () => {
    const learning = engine.review(engine.introduce(t0), 'GOOD', t0);
    expect(learning.state).toBe('LEARNING');

    const again = engine.review(learning, 'AGAIN', learning.dueAt);
    expect(again.lapses).toBe(0);
    expect(again.reps).toBe(2);
  });

  it('stamps the engine profile onto a card carrying a stale one', () => {
    const stale: SrsCard = { ...engine.introduce(t0), profileId: 'fsrs-5-something-old' };
    expect(engine.review(stale, 'GOOD', t0).profileId).toBe(SSZ_FSRS_PROFILE.id);
  });
});
