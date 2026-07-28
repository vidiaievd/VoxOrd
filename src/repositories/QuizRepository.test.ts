import { quizRepository } from './QuizRepository';

/**
 * Small decks are the point of these tests: until Phase 9's follow-up fix a
 * pool below four words returned no questions at all, and the screen ran to
 * completion with nothing in it — a phase the user never saw happen.
 */

type Row = Record<string, unknown>;

const mockExecute = jest.fn();

jest.mock('../db/database', () => ({
  getDatabase: () => ({ execute: mockExecute }),
}));

interface Fixture {
  /** Words in the deck (also the drilled pool unless overridden). */
  deck:   { wordId: number; word: string; translation: string }[];
  /** Everything else in the user's dictionary. */
  global: { wordId: number; translation: string }[];
}

/**
 * Routes the repository's three queries by shape: the drilled pool joins
 * `word_mode_strength`, the deck-wide distractor pool joins `deck_words`
 * without it, and the dictionary-wide top-up joins neither.
 */
function mockDatabase({ deck, global }: Fixture) {
  mockExecute.mockReset();
  mockExecute.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('word_mode_strength')) {
      const ids = /w\.id IN \(([^)]*)\)/.exec(sql)?.[1];
      const rows: Row[] = ids
        ? deck.filter(w => ids.split(',').includes(String(w.wordId)))
        : deck;
      const limit = params[params.length - 1] as number;
      return { rows: rows.slice(0, limit) };
    }

    if (sql.includes('deck_words')) return { rows: deck };

    const excluded = /w\.id NOT IN \(([^)]*)\)/.exec(sql)?.[1]?.split(',') ?? [];
    return { rows: global.filter(w => !excluded.includes(String(w.wordId))) };
  });
}

const wordsOf = (n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({
    wordId:      offset + i + 1,
    word:        `word${offset + i + 1}`,
    translation: `translation${offset + i + 1}`,
  }));

const dictionary = (n: number, offset: number) =>
  wordsOf(n, offset).map(({ wordId, translation }) => ({ wordId, translation }));

describe('quizRepository.getQuestionsForDeck', () => {
  it('asks about every word of a deck smaller than the option count', async () => {
    mockDatabase({ deck: wordsOf(2), global: dictionary(10, 100) });

    const questions = await quizRepository.getQuestionsForDeck(1, 'ru');

    expect(questions.map(q => q.wordId)).toEqual([1, 2]);
    for (const question of questions) {
      expect(question.options).toHaveLength(4);
      expect(question.options).toContain(question.correctAnswer);
      expect(new Set(question.options).size).toBe(4);
    }
  });

  it('tops a small deck up from the rest of the dictionary', async () => {
    mockDatabase({ deck: wordsOf(2), global: dictionary(10, 100) });

    const [question] = await quizRepository.getQuestionsForDeck(1, 'ru');
    const distractors = question.options.filter(o => o !== question.correctAnswer);

    expect(distractors.some(d => !['translation1', 'translation2'].includes(d))).toBe(
      true,
    );
  });

  it('does the same for an overrideWordIds subset below the option count', async () => {
    mockDatabase({ deck: wordsOf(2), global: dictionary(10, 100) });

    const questions = await quizRepository.getQuestionsForDeck(1, 'ru', [1, 2]);

    expect(questions.map(q => q.wordId)).toEqual([1, 2]);
    expect(questions.every(q => q.options.length === 4)).toBe(true);
  });

  it('shrinks the option count when the dictionary is nearly empty', async () => {
    mockDatabase({ deck: wordsOf(2), global: [] });

    const questions = await quizRepository.getQuestionsForDeck(1, 'ru');

    expect(questions).toHaveLength(2);
    for (const question of questions) {
      expect(question.options).toHaveLength(2);
      expect(question.options).toContain(question.correctAnswer);
    }
  });

  it('never offers the answer twice when a distractor shares its translation', async () => {
    mockDatabase({
      deck:   wordsOf(2),
      global: [{ wordId: 100, translation: 'translation1' }, ...dictionary(3, 200)],
    });

    const [question] = await quizRepository.getQuestionsForDeck(1, 'ru');

    expect(question.options.filter(o => o === question.correctAnswer)).toHaveLength(1);
  });

  it('drops a word the dictionary cannot distract from at all', async () => {
    mockDatabase({ deck: wordsOf(1), global: [] });

    expect(await quizRepository.getQuestionsForDeck(1, 'ru')).toEqual([]);
  });

  it('returns nothing for an empty deck', async () => {
    mockDatabase({ deck: [], global: dictionary(10, 100) });

    expect(await quizRepository.getQuestionsForDeck(1, 'ru')).toEqual([]);
  });

  it('keeps a deck large enough to distract from off the dictionary query', async () => {
    mockDatabase({ deck: wordsOf(6), global: dictionary(10, 100) });

    const questions = await quizRepository.getQuestionsForDeck(1, 'ru');

    expect(questions).toHaveLength(6);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    for (const question of questions) {
      const distractors = question.options.filter(o => o !== question.correctAnswer);
      expect(distractors.every(d => /^translation[1-6]$/.test(d))).toBe(true);
    }
  });
});
