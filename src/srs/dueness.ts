import type { SrsCard } from './engine.port';

/**
 * What "new", "due" and "learned" mean now that FSRS owns the local schedule
 * (plan Step 9.5), in one place, because five call sites used to answer it
 * independently from the retired `word_progress.status` column.
 *
 * The SQL fragments and the pure classifier below are built from the same
 * constants on purpose: the queries cannot be unit-tested (`db/database.ts`
 * opens SQLite at import time), so the rules they encode are tested through
 * `classifyCard` instead.
 */

/**
 * Stability at or above which a word counts as learned, in days.
 *
 * Continues the bridge Step 9.3's conversion was built on: stability *is* the
 * number of days until recall falls to 90%, and the profile schedules at
 * `requestRetention = 0.9`, so stability and the interval the engine hands out
 * mean the same thing. The retired engine called stage 4 "learned" and stage 4
 * was the 3-day interval — so 3 days of stability is the same threshold
 * expressed in the new model's terms, not a new judgement.
 */
export const LEARNED_STABILITY_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Exclusive progress buckets. Every word is in exactly one. */
export type ProgressBucket = 'new' | 'learning' | 'learned';

/**
 * A word's progress, ignoring whether it happens to be due right now — a word
 * does not become less learned by falling due.
 *
 * `null` means the row holds no FSRS card yet (see `readCard`), which is the
 * same thing as never introduced.
 */
export function bucketOf(card: SrsCard | null): ProgressBucket {
  if (!card || card.state === 'NEW') return 'new';
  return card.stability >= LEARNED_STABILITY_DAYS ? 'learned' : 'learning';
}

/**
 * Whether the word is waiting to be reviewed *now*.
 *
 * Orthogonal to `bucketOf`: a learned word is still due when its interval
 * elapses. Never-introduced words are deliberately **not** due — they are new,
 * which is what the retired `repeatWords` count also excluded. This is the
 * behaviour change Step 9.5 is expected to produce: the count now means "due",
 * where it used to mean "at stage 1–3".
 */
export function isDue(card: SrsCard | null, now: number): boolean {
  if (!card || card.state === 'NEW') return false;
  return card.dueAt <= now;
}

/**
 * XP for a word that was just reviewed, preserving the retired engine's scale
 * exactly: it paid `(stage + 1) * 5`, i.e. 5 XP for a word it scheduled at
 * once through 30 XP for one it scheduled a week out. The bands below are that
 * engine's own intervals, read against stability for the reason given on
 * `LEARNED_STABILITY_DAYS`.
 */
export function xpForCard(card: SrsCard): number {
  const stabilityMs = card.stability * DAY_MS;
  const bands = [
    1 * 60 * 60 * 1000, // 1h  — the old stage 1
    8 * 60 * 60 * 1000, // 8h  — stage 2
    1 * DAY_MS, //         1d  — stage 3
    3 * DAY_MS, //         3d  — stage 4
    7 * DAY_MS, //         7d  — stage 5
  ];

  let level = 0;
  for (const band of bands) {
    if (stabilityMs < band) break;
    level += 1;
  }
  return (level + 1) * 5;
}

/**
 * SQL, for the queries that must count or order without loading cards.
 *
 * `wp` is the `word_progress` alias; `?` binds the current epoch ms. A NULL
 * `fsrsProfileId` is a row that holds no card yet — normal, not an error.
 */
export const SQL = {
  /** True for a word never introduced to the scheduler. */
  isNew: (wp: string) => `(${wp}.fsrsProfileId IS NULL OR ${wp}.fsrsState = 'NEW')`,

  /** True for a card whose interval has elapsed. Takes one `?` bind: now. */
  isDue: (wp: string) =>
    `(${wp}.fsrsProfileId IS NOT NULL AND ${wp}.fsrsState != 'NEW' AND ${wp}.fsrsDueAt <= ?)`,

  /** True for a card the engine now schedules at least a few days out. */
  isLearned: (wp: string) =>
    `(${wp}.fsrsProfileId IS NOT NULL AND ${wp}.fsrsState != 'NEW' AND ${wp}.fsrsStability >= ${LEARNED_STABILITY_DAYS})`,
};
