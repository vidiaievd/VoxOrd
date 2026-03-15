import { getDatabase } from '../db/database';
import { TABLE, RelationType } from '../db/types';

export interface RelatedWord {
  id: number;
  word: string;
  translation: string;
  relationType: RelationType;
  strength: number;
}

class WordRelationRepository {
  async getRelated(
    wordId: number,
    uiLang: string = 'ru',
    type?: RelationType,
  ): Promise<RelatedWord[]> {
    const db = getDatabase();

    const typeFilter = type ? 'AND wr.relationType = ?' : '';
    const params = type ? [wordId, uiLang, type] : [wordId, uiLang];

    const result = await db.execute(
      `SELECT
         w.id, w.word,
         t.translation,
         wr.relationType,
         wr.strength
       FROM ${TABLE.WORD_RELATIONS} wr
       JOIN ${TABLE.WORDS}        w  ON w.id = wr.relatedWordId
       JOIN ${TABLE.TRANSLATIONS} t  ON t.wordId = w.id AND t.languageCode = ?2
       WHERE wr.wordId = ?1
         ${typeFilter}
       ORDER BY wr.strength DESC;`,
      params,
    );

    return (result.rows ?? []).map(row => ({
      id: row.id as number,
      word: row.word as string,
      translation: row.translation as string,
      relationType: row.relationType as RelationType,
      strength: row.strength as number,
    }));
  }

  async addRelation(
    wordId: number,
    relatedWordId: number,
    relationType: RelationType,
    strength: number = 1.0,
  ): Promise<void> {
    const db = getDatabase();
    await db.execute(
      `INSERT OR REPLACE INTO ${TABLE.WORD_RELATIONS}
         (wordId, relatedWordId, relationType, strength)
       VALUES (?, ?, ?, ?);`,
      [wordId, relatedWordId, relationType, strength],
    );
  }

  // Получить кластер связанных слов для сессии
  async getCluster(wordId: number, depth: number = 2): Promise<number[]> {
    const visited = new Set<number>([wordId]);
    let current = [wordId];

    for (let d = 0; d < depth; d++) {
      const next: number[] = [];
      for (const id of current) {
        const related = await this.getRelated(id);
        for (const w of related) {
          if (!visited.has(w.id)) {
            visited.add(w.id);
            next.push(w.id);
          }
        }
      }
      current = next;
      if (current.length === 0) break;
    }

    visited.delete(wordId);
    return Array.from(visited);
  }
}

export const wordRelationRepository = new WordRelationRepository();
