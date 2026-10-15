import { apiClient } from './client';

const SRS_STATS_PATH = '/api/v1/srs/stats/me';
const SRS_DUE_PATH = '/api/v1/srs/due';
const SRS_REVIEW_PATH = (cardId: string) => `/api/v1/srs/cards/${cardId}/review`;

/**
 * `GET /srs/stats/me` (learning-service). Confirmed against
 * services/learning-service/src/modules/srs/presentation/srs.controller.ts
 * and srs.dto.ts (`SrsStatsDto`) — proxied by the gateway's existing
 * `location /api/v1/srs` block.
 *
 * `dueNowCount` is the real total due count. `GET /srs/due` only returns a
 * bounded sample — do not use its `cards` array length as a due count, that
 * was a bug found and fixed in the web BFF (see the plan's Phase 6 gateway
 * note).
 */
export interface SrsStats {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  relearningCount: number;
  suspendedCount: number;
  dueNowCount: number;
  reviewedTodayCount: number;
}

export async function getSrsStats(): Promise<SrsStats> {
  return apiClient.get<SrsStats>(SRS_STATS_PATH);
}

/**
 * Ratings are the server's string enum, NOT the 1..4 numbers the web BFF
 * sends (that request is rejected with a 400 — see the plan's Phase 8
 * research findings). Order here is the order the buttons are shown in.
 */
export const REVIEW_RATINGS = ['AGAIN', 'HARD', 'GOOD', 'EASY'] as const;

export type ReviewRating = (typeof REVIEW_RATINGS)[number];

export type SrsContentType = 'EXERCISE' | 'VOCABULARY_WORD';

export type SrsCardState = 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING' | 'SUSPENDED';

/** What each rating would schedule, computed by the server for this card. */
export interface PredictedInterval {
  rating: ReviewRating;
  scheduledDays: number;
  /** Human-readable interval, e.g. "3 d" — rendered under the rating button. */
  label: string;
}

/** Word content resolved server-side; null on EXERCISE cards. */
export interface SrsCardFront {
  word: string;
  partOfSpeech: string | null;
  ipaTranscription: string | null;
  audioMediaId: string | null;
  listId: string;
}

export interface SrsCardBack {
  translation: string | null;
  alternativeTranslations: string[];
  definition: string | null;
  usageNotes: string | null;
  translationLanguage: string | null;
  /** The translation came from a language other than the one requested. */
  fallbackUsed: boolean;
  /** No usable translation exists — show the target language only. */
  immersionMode: boolean;
  examples: Array<{ text: string; translation: string | null; audioMediaId: string | null }>;
}

/**
 * `ReviewCardDto` from learning-service, verbatim. `front`/`back` are filled
 * for VOCABULARY_WORD cards by the due-cards handler (ssz-platform `4127811`)
 * and are absent on EXERCISE cards — and also on a card whose content lookup
 * failed, which is deliberately non-fatal server-side, so treat them as
 * optional everywhere.
 */
export interface SrsCard {
  id: string;
  userId: string;
  contentType: SrsContentType;
  contentId: string;
  state: SrsCardState;
  /** ISO 8601. */
  dueAt: string;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  predicted: PredictedInterval[];
  front?: SrsCardFront | null;
  back?: SrsCardBack | null;
}

export interface SrsDueEnvelope {
  cards: SrsCard[];
  reviewedToday: number;
  dailyLimit: number;
  streakDays: number;
}

export interface GetDueOptions {
  /** Server caps this at 100; it defaults to 20. */
  limit?: number;
  /** Preferred translation language for card content (BCP-47). */
  language?: string;
  includeExamples?: boolean;
}

/**
 * `GET /srs/due`. The server takes only these three params — there is no
 * `contentType` or `courseId` filter, so the queue is the user's global one
 * and mixes VOCABULARY_WORD with EXERCISE cards. Filter client-side; see
 * `vocabularyCards`.
 */
export async function getDueCards(options: GetDueOptions = {}): Promise<SrsDueEnvelope> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.language) params.set('language', options.language);
  if (options.includeExamples) params.set('includeExamples', 'true');

  const query = params.toString();
  return apiClient.get<SrsDueEnvelope>(query ? `${SRS_DUE_PATH}?${query}` : SRS_DUE_PATH);
}

export interface ReviewCardRequest {
  rating: ReviewRating;
  /** ISO 8601. Send it for queued reviews so the server dates them honestly. */
  reviewedAt?: string;
  /**
   * Makes a replayed submission a no-op (ssz-platform `1960b23`, remembered
   * for 7 days). Always send one — the offline queue replays by design, and
   * without a key a retry reschedules the card a second time.
   */
  idempotencyKey?: string;
  /**
   * The learner was shown that today's review quota is met and chose to keep
   * going, which lifts the daily review cap for this submission (ssz-platform
   * plan 37 §B.1). Send it only in answer to that choice — the server reads it
   * as "the learner was asked and said yes". It has no effect on the daily
   * new-card cap, which is not the learner's call to make.
   */
  carryOnPastLimit?: boolean;
}

/**
 * `POST /srs/cards/:id/review`. Returns the rescheduled card — the client
 * never computes FSRS for course words, it overwrites its copy with this.
 * Note the response has an empty `predicted` array (the server only fills it
 * on `/due`) and no `front`/`back`.
 */
export async function reviewCard(
  cardId: string,
  request: ReviewCardRequest,
): Promise<SrsCard> {
  return apiClient.post<SrsCard>(SRS_REVIEW_PATH(cardId), request);
}

const SRS_VOCABULARY_REPLICA_PATH = '/api/v1/srs/cards/vocabulary';

/**
 * A card as the vocabulary replica carries it: the review card plus the two FSRS fields the
 * scheduler reads that the review card leaves out. `predicted` is always empty and there is
 * no `front`/`back` — words come from the imported decks.
 */
export interface ReplicaCard extends SrsCard {
  elapsedDays: number;
  learningSteps: number;
}

export interface VocabularyReplica {
  /** When the copy was taken. */
  serverTime: string;
  /** Vocabulary reviews counted today, and the cap they are measured against. */
  reviewedToday: number;
  dailyLimit: number;
  /** Every vocabulary card of the learner, suspended included. */
  cards: ReplicaCard[];
}

/**
 * `GET /srs/cards/vocabulary` — every vocabulary card of the learner with its full FSRS
 * state, the copy the phone keeps to review words offline (offline plan, B1).
 */
export async function getVocabularyReplica(): Promise<VocabularyReplica> {
  return apiClient.get<VocabularyReplica>(SRS_VOCABULARY_REPLICA_PATH);
}

/** The subset a word trainer can render: vocabulary cards with content. */
export function vocabularyCards(cards: SrsCard[]): SrsCard[] {
  return cards.filter((card) => card.contentType === 'VOCABULARY_WORD' && !!card.front);
}

/**
 * Predicted intervals as a lookup, so a rating button can show its own label
 * without scanning the array. Missing ratings simply have no label — the
 * review response carries none at all.
 */
export function predictedByRating(card: SrsCard): Partial<Record<ReviewRating, string>> {
  const labels: Partial<Record<ReviewRating, string>> = {};
  for (const prediction of card.predicted ?? []) {
    labels[prediction.rating] = prediction.label;
  }
  return labels;
}

const SRS_INTRODUCE_PATH = '/api/v1/srs/cards/introduce';
const SRS_CARD_STATES_PATH = '/api/v1/srs/cards/states';

/** The server's own cap on one `cards/states` call. */
export const CARD_STATES_MAX_IDS = 500;

/**
 * `POST /srs/cards/introduce` — puts a word into the student's review. Idempotent: an
 * existing card comes back as it is and costs nothing; a new one counts against the day's
 * new-card budget, and past it the server answers 429.
 */
export async function introduceCard(
  contentType: 'VOCABULARY_WORD',
  contentId: string,
): Promise<SrsCard> {
  return apiClient.post<SrsCard>(SRS_INTRODUCE_PATH, { contentType, contentId });
}

/**
 * `POST /srs/cards/states` — the cards these words already have. Ids without one are left
 * out. No card id comes back: `introduceCard` on an existing card is the way to get it.
 */
export async function getCardStates(
  contentType: 'VOCABULARY_WORD',
  contentIds: string[],
): Promise<{ states: { contentId: string; state: string }[] }> {
  return apiClient.post(SRS_CARD_STATES_PATH, { contentType, contentIds });
}

/** `POST /srs/cards/:id/suspend` — out of the due queue, its history kept. */
export async function suspendCard(cardId: string): Promise<void> {
  await apiClient.post(`/api/v1/srs/cards/${cardId}/suspend`);
}

/** `POST /srs/cards/:id/unsuspend` — back into the due queue. */
export async function unsuspendCard(cardId: string): Promise<void> {
  await apiClient.post(`/api/v1/srs/cards/${cardId}/unsuspend`);
}
