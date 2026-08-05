import { FSRS, Rating, State, createEmptyCard } from 'ts-fsrs';
import type { Card, Grade } from 'ts-fsrs';
import type {
  SrsCard,
  SrsEngine,
  SrsPrediction,
  SrsRating,
  SrsState,
} from './engine.port';
import { SSZ_FSRS_PROFILE, type FsrsProfile } from './profiles';

/**
 * The ONLY file in the app that imports `ts-fsrs`. Everything else depends on
 * `engine.port.ts`. Mirrors learning-service's `FsrsScheduler` field-for-field
 * so both sides schedule identically — see `fsrs-adapter.test.ts`, which
 * replays golden vectors captured from that scheduler.
 */

function toGrade(rating: SrsRating): Grade {
  switch (rating) {
    case 'AGAIN': return Rating.Again;
    case 'HARD':  return Rating.Hard;
    case 'GOOD':  return Rating.Good;
    case 'EASY':  return Rating.Easy;
  }
}

function fromFsrsState(state: State): SrsState {
  switch (state) {
    case State.New:        return 'NEW';
    case State.Learning:   return 'LEARNING';
    case State.Review:     return 'REVIEW';
    case State.Relearning: return 'RELEARNING';
    // ts-fsrs has no other states; this branch is unreachable in normal flow.
    default:               return 'REVIEW';
  }
}

function toFsrsState(state: SrsState): State {
  switch (state) {
    case 'NEW':        return State.New;
    case 'LEARNING':   return State.Learning;
    case 'REVIEW':     return State.Review;
    case 'RELEARNING': return State.Relearning;
  }
}

function toFsrsCard(card: SrsCard): Card {
  return {
    due: new Date(card.dueAt),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learningSteps,
    state: toFsrsState(card.state),
    last_review: card.lastReviewedAt === null ? undefined : new Date(card.lastReviewedAt),
  };
}

export class FsrsAdapter implements SrsEngine {
  private readonly fsrs: FSRS;

  constructor(private readonly profile: FsrsProfile = SSZ_FSRS_PROFILE) {
    this.fsrs = new FSRS({
      w: [...profile.w],
      request_retention: profile.requestRetention,
      maximum_interval: profile.maximumIntervalDays,
      enable_short_term: profile.enableShortTerm,
      enable_fuzz: profile.enableFuzz,
      learning_steps: [...profile.learningSteps],
      relearning_steps: [...profile.relearningSteps],
    });
  }

  get profileId(): string {
    return this.profile.id;
  }

  introduce(now: number): SrsCard {
    const card = createEmptyCard(new Date(now));
    return {
      state: fromFsrsState(card.state),
      stability: card.stability,
      difficulty: card.difficulty,
      dueAt: card.due.getTime(),
      reps: card.reps,
      lapses: card.lapses,
      elapsedDays: card.elapsed_days,
      scheduledDays: card.scheduled_days,
      learningSteps: card.learning_steps,
      lastReviewedAt: null,
      profileId: this.profile.id,
    };
  }

  review(card: SrsCard, rating: SrsRating, reviewedAt: number): SrsCard {
    const { card: next } = this.fsrs.next(
      toFsrsCard(card),
      new Date(reviewedAt),
      toGrade(rating),
    );

    // reps/lapses are taken from the domain rule rather than from ts-fsrs's own
    // counters, to match learning-service's ReviewCard.review(): a lapse is a
    // REVIEW-state card rated AGAIN, not any AGAIN.
    const isLapse = card.state === 'REVIEW' && rating === 'AGAIN';

    return {
      state: fromFsrsState(next.state),
      stability: next.stability,
      difficulty: next.difficulty,
      dueAt: next.due.getTime(),
      reps: card.reps + 1,
      lapses: card.lapses + (isLapse ? 1 : 0),
      elapsedDays: next.elapsed_days,
      scheduledDays: next.scheduled_days,
      learningSteps: next.learning_steps,
      lastReviewedAt: reviewedAt,
      // The numbers above were produced by THIS profile, whatever the input
      // card was stamped with.
      profileId: this.profile.id,
    };
  }

  retrievability(card: SrsCard, now: number): number {
    // A card that has never been reviewed has no forgetting curve yet.
    if (card.state === 'NEW') return 0;
    return this.fsrs.get_retrievability(toFsrsCard(card), new Date(now), false);
  }

  predict(card: SrsCard, now: number): SrsPrediction[] {
    const preview = this.fsrs.repeat(toFsrsCard(card), new Date(now));
    const ratings: Array<[Grade, SrsRating]> = [
      [Rating.Again, 'AGAIN'],
      [Rating.Hard, 'HARD'],
      [Rating.Good, 'GOOD'],
      [Rating.Easy, 'EASY'],
    ];

    return ratings.map(([grade, name]) => ({
      rating: name,
      scheduledDays: preview[grade].card.scheduled_days,
      dueAt: preview[grade].card.due.getTime(),
    }));
  }
}

/**
 * True when a stored card was produced by a different profile than the engine
 * in use — its numbers must be recomputed or migrated, not trusted. Nothing
 * reads this yet; the local schedule migration (Step 9.3) is its first caller.
 */
export function needsProfileMigration(card: SrsCard, engine: SrsEngine): boolean {
  return card.profileId !== engine.profileId;
}
