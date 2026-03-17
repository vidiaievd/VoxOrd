import { getDatabase } from '../db/database';

export interface PronunciationItem {
  type:        'word' | 'phrase';
  referenceId: number;
  text:        string;
  translation: string;
  difficulty:  number;
}

// Strip gap-fill markers: (gjøre) → gjøre, [word] → word
export function normalizeForSpeech(text: string): string {
  return text
    .replace(/\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

class PronunciationRepository {
  // ─── Words ────────────────────────────────────────────────────────────────

  async getWordsForDeck(deckId: number): Promise<PronunciationItem[]> {
    const db     = getDatabase();
    const result = await db.execute(
      `SELECT
         w.id,
         w.word,
         t.translation
       FROM words w
       JOIN deck_words  dw ON dw.wordId  = w.id
       JOIN translations t ON t.wordId   = w.id AND t.languageCode = 'ru'
       WHERE dw.deckId = ?
       ORDER BY RANDOM();`,
      [deckId],
    );

    return (result.rows ?? []).map(row => ({
      type:        'word' as const,
      referenceId:  row.id          as number,
      text:         row.word        as string,
      translation:  row.translation as string,
      difficulty:   1,
    }));
  }

  // ─── Phrases (from word_examples) ─────────────────────────────────────────

  async getPhrasesForDeck(deckId: number): Promise<PronunciationItem[]> {
    const db     = getDatabase();
    const result = await db.execute(
      `SELECT
         we.id,
         we.sentence,
         w.word,
         wet.translation
       FROM word_examples we
       JOIN words w ON w.id = we.wordId
       JOIN deck_words dw ON dw.wordId = w.id
       LEFT JOIN word_example_translations wet
         ON wet.exampleId = we.id AND wet.languageCode = 'ru'
       WHERE dw.deckId = ?
         AND we.sentenceLanguage = 'no'
         AND wet.translation IS NOT NULL
       ORDER BY RANDOM()
       LIMIT 20;`,
      [deckId],
    );

    return (result.rows ?? []).map(row => ({
      type:        'phrase' as const,
      referenceId:  row.id                                                as number,
      text:         normalizeForSpeech(
        (row.sentence as string).replace('___', row.word as string)
      ),
      translation:  row.translation as string,
      difficulty:   2,
    }));
  }

  // ─── Combined ─────────────────────────────────────────────────────────────

  async getItemsForDeck(
    deckId: number,
    mode:   'words' | 'phrases' | 'mixed' = 'mixed',
    limit:  number = 20,
  ): Promise<PronunciationItem[]> {
    let items: PronunciationItem[] = [];

    if (mode === 'words' || mode === 'mixed') {
      items.push(...await this.getWordsForDeck(deckId));
    }

    if (mode === 'phrases' || mode === 'mixed') {
      items.push(...await this.getPhrasesForDeck(deckId));
    }

    if (mode === 'mixed') {
      items = items.sort(() => Math.random() - 0.5);
    }

    return items.slice(0, limit);
  }

  // ─── Record result ─────────────────────────────────────────────────────────

  async recordResult(params: {
    wordId:    number | null;
    deckId:    number;
    score:     number;
    isCorrect: boolean;
  }): Promise<void> {
    if (!params.wordId) return;

    const db = getDatabase();
    await db.execute(
      `INSERT INTO word_mode_strength
         (wordId, deckId, exerciseType, strength, errorCount, reviewCount, lastReviewed)
       VALUES (?, ?, 'pronunciation', ?, ?, 1, ?)
       ON CONFLICT(wordId, deckId, exerciseType) DO UPDATE SET
         strength     = MIN(1.0, MAX(0.0, strength + ?)),
         errorCount   = errorCount + ?,
         reviewCount  = reviewCount + 1,
         lastReviewed = ?;`,
      [
        params.wordId,
        params.deckId,
        params.isCorrect ? 0.25 : 0.0,
        params.isCorrect ? 0    : 1,
        Date.now(),
        params.isCorrect ? 0.25 : -0.35,
        params.isCorrect ? 0    : 1,
        Date.now(),
      ],
    );
  }
}

export const pronunciationRepository = new PronunciationRepository();