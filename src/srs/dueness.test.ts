import { bucketOf, isDue, LEARNED_STABILITY_DAYS, SQL, xpForCard } from './dueness';
import type { SrsCard } from './engine.port';
import { FsrsAdapter } from './fsrs-adapter';

const engine = new FsrsAdapter();
const NOW = Date.UTC(2026, 6, 28, 9, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function card(over: Partial<SrsCard> = {}): SrsCard {
  return { ...engine.review(engine.introduce(NOW), 'GOOD', NOW), ...over };
}

describe('bucketOf', () => {
  it('calls a row with no card new', () => {
    expect(bucketOf(null)).toBe('new');
  });

  it('calls an introduced but unreviewed card new', () => {
    expect(bucketOf(engine.introduce(NOW))).toBe('new');
  });

  it('calls a low-stability card learning', () => {
    expect(bucketOf(card({ stability: LEARNED_STABILITY_DAYS - 0.01 }))).toBe('learning');
  });

  it('calls a card at the threshold learned', () => {
    expect(bucketOf(card({ stability: LEARNED_STABILITY_DAYS }))).toBe('learned');
  });

  it('does not un-learn a word just because it fell due', () => {
    const overdue = card({ stability: 30, dueAt: NOW - 10 * DAY });
    expect(isDue(overdue, NOW)).toBe(true);
    expect(bucketOf(overdue)).toBe('learned');
  });
});

describe('isDue', () => {
  it('is false for a word never introduced', () => {
    // The retired repeatWords count excluded new words too; Home's study-now
    // number would otherwise jump by the whole unseen backlog.
    expect(isDue(null, NOW)).toBe(false);
    expect(isDue(engine.introduce(NOW), NOW)).toBe(false);
  });

  it('is true exactly at the due moment', () => {
    expect(isDue(card({ dueAt: NOW }), NOW)).toBe(true);
    expect(isDue(card({ dueAt: NOW + 1 }), NOW)).toBe(false);
  });

  it('is true for an overdue card', () => {
    expect(isDue(card({ dueAt: NOW - DAY }), NOW)).toBe(true);
  });
});

describe('xpForCard — the retired engine paid (stage + 1) * 5', () => {
  it('reproduces every step of the old scale from its own intervals', () => {
    const cases: Array<[number, number]> = [
      [0, 5], //                stage 0 — scheduled at once
      [0.5 / 24, 5], //         under 1h
      [1 / 24, 10], //          1h  — stage 1
      [7 / 24, 10],
      [8 / 24, 15], //          8h  — stage 2
      [1, 20], //               1d  — stage 3
      [2.99, 20],
      [3, 25], //               3d  — stage 4
      [7, 30], //               7d  — stage 5
      [400, 30], //             the top band does not keep growing
    ];

    for (const [stability, expected] of cases) {
      expect(xpForCard(card({ stability }))).toBe(expected);
    }
  });

  it('spans exactly the old 5..30 range', () => {
    expect(xpForCard(card({ stability: 0 }))).toBe(5);
    expect(xpForCard(card({ stability: 1000 }))).toBe(30);
  });
});

describe('SQL fragments', () => {
  it('are built from the same threshold as the classifier', () => {
    expect(SQL.isLearned('wp')).toContain(String(LEARNED_STABILITY_DAYS));
  });

  it('treat a NULL profile as new, never as a zero-stability card', () => {
    expect(SQL.isNew('wp')).toContain('fsrsProfileId IS NULL');
    expect(SQL.isDue('wp')).toContain('fsrsProfileId IS NOT NULL');
    expect(SQL.isLearned('wp')).toContain('fsrsProfileId IS NOT NULL');
  });

  it('exclude NEW-state cards from due and learned, as the classifier does', () => {
    expect(SQL.isDue('wp')).toContain("fsrsState != 'NEW'");
    expect(SQL.isLearned('wp')).toContain("fsrsState != 'NEW'");
  });

  it('take exactly one bind for the current time, and only in isDue', () => {
    expect(SQL.isDue('wp').match(/\?/g)).toHaveLength(1);
    expect(SQL.isNew('wp')).not.toContain('?');
    expect(SQL.isLearned('wp')).not.toContain('?');
  });
});
