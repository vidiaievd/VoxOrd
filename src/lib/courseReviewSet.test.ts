import type { SrsCard, SrsCardState } from '../api/srs';
import {
  buildReviewSet,
  cardIdForWord,
  groupByDeck,
  isGraded,
  newCardWordIds,
  padNeeded,
  planPhases,
  resolveDueWords,
  type CourseDueWord,
  type LinkedWordRow,
} from './courseReviewSet';

function card(over: Partial<SrsCard> & { id: string; contentId: string }): SrsCard {
  return {
    userId: 'u1',
    contentType: 'VOCABULARY_WORD',
    state: 'REVIEW' as SrsCardState,
    dueAt: '2026-07-27T00:00:00.000Z',
    stability: 1,
    difficulty: 5,
    scheduledDays: 1,
    reps: 1,
    lapses: 0,
    lastReviewedAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    predicted: [],
    front: {
      word: 'danse',
      partOfSpeech: null,
      ipaTranscription: null,
      audioMediaId: null,
      listId: 'list-1',
    },
    back: null,
    ...over,
  };
}

function row(wordId: number, platformItemId: string, deckId = 10): LinkedWordRow {
  return { wordId, deckId, platformItemId };
}

function dueWord(wordId: number, deckId = 10): CourseDueWord {
  return { cardId: `c${wordId}`, wordId, deckId, state: 'REVIEW', word: `w${wordId}` };
}

describe('resolveDueWords', () => {
  it('matches a card to the local row through platformItemId', () => {
    const { resolved, unresolvedCardIds } = resolveDueWords(
      [card({ id: 'c1', contentId: 'item-1' })],
      [row(5, 'item-1', 42)],
    );

    expect(unresolvedCardIds).toEqual([]);
    expect(resolved).toEqual([
      { cardId: 'c1', wordId: 5, deckId: 42, state: 'REVIEW', word: 'danse' },
    ]);
  });

  it('reports cards whose list was never imported instead of dropping them', () => {
    const { resolved, unresolvedCardIds } = resolveDueWords(
      [card({ id: 'c1', contentId: 'item-1' }), card({ id: 'c2', contentId: 'nope' })],
      [row(5, 'item-1')],
    );

    expect(resolved.map((w) => w.cardId)).toEqual(['c1']);
    expect(unresolvedCardIds).toEqual(['c2']);
  });

  it('ignores EXERCISE cards — the due queue is global and mixes them in', () => {
    const { resolved, unresolvedCardIds } = resolveDueWords(
      [card({ id: 'c1', contentId: 'item-1', contentType: 'EXERCISE' })],
      [row(5, 'item-1')],
    );

    expect(resolved).toEqual([]);
    expect(unresolvedCardIds).toEqual([]);
  });

  it('ignores a vocabulary card whose content lookup failed server-side', () => {
    const { resolved } = resolveDueWords(
      [card({ id: 'c1', contentId: 'item-1', front: null })],
      [row(5, 'item-1')],
    );

    expect(resolved).toEqual([]);
  });

  it('never resolves two cards onto the same local word', () => {
    const { resolved } = resolveDueWords(
      [card({ id: 'c1', contentId: 'item-1' }), card({ id: 'c2', contentId: 'item-1' })],
      [row(5, 'item-1')],
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0].cardId).toBe('c1');
  });
});

describe('groupByDeck', () => {
  it('buckets by deck, largest first', () => {
    const grouped = groupByDeck([
      dueWord(1, 7),
      dueWord(2, 9),
      dueWord(3, 9),
      dueWord(4, 9),
    ]);

    expect([...grouped.keys()]).toEqual([9, 7]);
    expect(grouped.get(9)).toHaveLength(3);
  });

  it('breaks ties by deck id so ordering is stable', () => {
    const grouped = groupByDeck([dueWord(1, 9), dueWord(2, 7)]);
    expect([...grouped.keys()]).toEqual([7, 9]);
  });
});

describe('padNeeded', () => {
  it('asks for enough words to reach the 4-option minimum', () => {
    expect(padNeeded(0)).toBe(4);
    expect(padNeeded(1)).toBe(3);
    expect(padNeeded(3)).toBe(1);
  });

  it('asks for nothing once the due set is big enough', () => {
    expect(padNeeded(4)).toBe(0);
    expect(padNeeded(12)).toBe(0);
  });
});

describe('buildReviewSet', () => {
  it('pads a small due set up to the minimum pool size', () => {
    const set = buildReviewSet(10, [dueWord(1), dueWord(2)], [50, 51, 52]);

    expect(set.padWordIds).toEqual([50, 51]);
    expect(set.wordIds).toEqual([1, 2, 50, 51]);
  });

  it('adds no padding when enough words are due', () => {
    const due = [dueWord(1), dueWord(2), dueWord(3), dueWord(4)];
    const set = buildReviewSet(10, due, [50, 51]);

    expect(set.padWordIds).toEqual([]);
    expect(set.wordIds).toEqual([1, 2, 3, 4]);
  });

  it('never uses a due word as padding', () => {
    const set = buildReviewSet(10, [dueWord(1)], [1, 50, 51, 52]);

    expect(set.padWordIds).toEqual([50, 51, 52]);
    expect(set.wordIds).toEqual([1, 50, 51, 52]);
  });

  it('tolerates a deck too small to reach the minimum', () => {
    const set = buildReviewSet(10, [dueWord(1)], []);

    expect(set.padWordIds).toEqual([]);
    expect(set.wordIds).toEqual([1]);
  });

  it('ignores duplicate padding candidates', () => {
    const set = buildReviewSet(10, [dueWord(1)], [50, 50, 51, 52]);
    expect(set.padWordIds).toEqual([50, 51, 52]);
  });
});

describe('newCardWordIds', () => {
  it('selects only cards the user has never studied', () => {
    const due = [
      { ...dueWord(1), state: 'NEW' as SrsCardState },
      dueWord(2),
      { ...dueWord(3), state: 'NEW' as SrsCardState },
    ];
    const set = buildReviewSet(10, due, []);

    expect(newCardWordIds(set)).toEqual([1, 3]);
  });

  it('is empty when everything has been seen', () => {
    expect(newCardWordIds(buildReviewSet(10, [dueWord(1)], []))).toEqual([]);
  });
});

describe('planPhases', () => {
  const fourWords = buildReviewSet(10, [dueWord(1), dueWord(2)], [50, 51]);

  it('runs listening, quiz and spelling once the pool is big enough', () => {
    expect(planPhases(fourWords, [])).toEqual(['listening', 'quiz', 'spelling']);
  });

  it('prepends a preview when there are unseen words', () => {
    expect(planPhases(fourWords, [1])).toEqual([
      'preview',
      'listening',
      'quiz',
      'spelling',
    ]);
  });

  it('drops the 4-option modes when even padding cannot reach the minimum', () => {
    const tiny = buildReviewSet(10, [dueWord(1)], [50]);
    expect(planPhases(tiny, [])).toEqual(['spelling']);
  });

  it('never includes context or matching', () => {
    expect(planPhases(fourWords, [1])).not.toContain('context');
    expect(planPhases(fourWords, [1])).not.toContain('matching');
  });

  it('plans nothing for an empty set', () => {
    expect(planPhases(buildReviewSet(10, [], []), [])).toEqual([]);
  });
});

describe('isGraded / cardIdForWord', () => {
  const set = buildReviewSet(10, [dueWord(1), dueWord(2)], [50, 51]);

  it('grades due words only', () => {
    expect(isGraded(set, 1)).toBe(true);
    expect(isGraded(set, 50)).toBe(false);
  });

  it('resolves the card a graded word belongs to', () => {
    expect(cardIdForWord(set, 2)).toBe('c2');
  });

  it('returns null for a padding word, so no review can be posted for it', () => {
    expect(cardIdForWord(set, 50)).toBeNull();
  });
});
