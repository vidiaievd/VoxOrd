import { cardValues, FSRS_COLUMNS, FSRS_SET_CLAUSE, readCard } from './cardRow';
import type { SrsCard } from './engine.port';
import { FsrsAdapter } from './fsrs-adapter';

/** A row as the database would hand it back, from a card. */
function rowOf(card: SrsCard): Record<string, unknown> {
  const values = cardValues(card);
  return Object.fromEntries(FSRS_COLUMNS.map((column, i) => [column, values[i]]));
}

const engine = new FsrsAdapter();
const NOW = Date.UTC(2026, 6, 28, 9, 0, 0);

describe('readCard / cardValues round trip', () => {
  it('survives a fresh card unchanged', () => {
    const card = engine.introduce(NOW);
    expect(readCard(rowOf(card))).toEqual(card);
  });

  it('survives a reviewed card unchanged, including lastReviewedAt', () => {
    const card = engine.review(engine.introduce(NOW), 'GOOD', NOW);
    const restored = readCard(rowOf(card));

    expect(restored).toEqual(card);
    expect(restored?.lastReviewedAt).toBe(NOW);
  });

  it('survives every state the scheduler can produce', () => {
    // AGAIN on a REVIEW card is the only route to RELEARNING, so walk there.
    const easy = engine.review(engine.introduce(NOW), 'EASY', NOW);
    const cards = [
      engine.introduce(NOW),
      engine.review(engine.introduce(NOW), 'GOOD', NOW),
      easy,
      engine.review(easy, 'AGAIN', NOW + 9 * 86_400_000),
    ];

    expect(cards.map((c) => c.state)).toEqual(['NEW', 'LEARNING', 'REVIEW', 'RELEARNING']);
    for (const card of cards) {
      expect(readCard(rowOf(card))).toEqual(card);
    }
  });

  it('emits values in the declared column order', () => {
    const card = engine.review(engine.introduce(NOW), 'HARD', NOW);
    const values = cardValues(card);

    expect(values).toHaveLength(FSRS_COLUMNS.length);
    expect(values[FSRS_COLUMNS.indexOf('fsrsProfileId')]).toBe(engine.profileId);
    expect(values[FSRS_COLUMNS.indexOf('fsrsState')]).toBe(card.state);
    expect(values[FSRS_COLUMNS.indexOf('fsrsDueAt')]).toBe(card.dueAt);
  });

  it('builds a SET clause with one placeholder per value', () => {
    expect(FSRS_SET_CLAUSE.split(',')).toHaveLength(FSRS_COLUMNS.length);
    expect(FSRS_SET_CLAUSE.startsWith('fsrsState = ?')).toBe(true);
  });
});

describe('readCard — rows that hold no card', () => {
  it('returns null for a row the migration never touched', () => {
    // Normal, not an error: seedIfEmpty() and the vocabulary importer both
    // insert word_progress rows after v10 ran.
    expect(readCard({ memoryStage: 3, nextReview: NOW, fsrsProfileId: null })).toBeNull();
  });

  it('returns null for an empty profile id', () => {
    expect(readCard({ fsrsProfileId: '', fsrsState: 'REVIEW' })).toBeNull();
  });

  it('does not mistake a never-reviewed row for a card with stability 0', () => {
    // The trap the v10 migration note calls out: reading this as a real card
    // would hand FSRS a zero-stability REVIEW card instead of introducing one.
    expect(readCard({ fsrsStability: 0, fsrsReps: 0, fsrsProfileId: null })).toBeNull();
  });

  it('returns null for an unrecognisable state rather than passing it on', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readCard({ ...rowOf(engine.introduce(NOW)), fsrsState: 'PAUSED' })).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('readCard — defensive reads', () => {
  it('treats a missing due date as due now', () => {
    const card = readCard({ ...rowOf(engine.introduce(NOW)), fsrsDueAt: null });
    expect(card?.dueAt).toBe(0);
  });

  it('reads a null lastReviewedAt as never reviewed', () => {
    const card = readCard({ ...rowOf(engine.introduce(NOW)), fsrsLastReviewedAt: null });
    expect(card?.lastReviewedAt).toBeNull();
  });

  it('keeps a foreign profile id instead of silently restamping it', () => {
    // Detection belongs to the caller (`needsProfileMigration`); discarding the
    // evidence here would make a profile change undetectable per card.
    const card = readCard({ ...rowOf(engine.introduce(NOW)), fsrsProfileId: 'other-profile' });
    expect(card?.profileId).toBe('other-profile');
  });
});
