import { getDatabase } from '../db/database';
import { DeckUserStatus } from '../db/types';

export interface DeckGroup {
  id: number;
  title: string;
  icon: string;
  sortOrder: number;
  decks: Deck[];
}

export interface Deck {
  id: number;
  title: string;
  icon: string;
  level: string | null;
  groupId: number | null;
  totalWords: number;
  learnedWords: number;
  newWords: number;
  repeatWords: number;
  isFavorite: boolean;
  status: DeckUserStatus;
  // startedAt: number | null;
  // completedAt: number | null;
  languageCode: string; //TODO fix with language groups
  sortOrder: number;
 }

class DeckRepository {
  async getAll(): Promise<Deck[]> {
    const db = getDatabase();
    const result = await db.execute(`
      SELECT
        d.id,
        d.title,
        d.icon,
        d.level,
        d.groupId,
        d.sortOrder,
        COUNT(wp.wordId)                                         AS totalWords,
        SUM(CASE WHEN wp.status = 'learned' THEN 1 ELSE 0 END)  AS learnedWords,
        SUM(CASE WHEN wp.status = 'new'     THEN 1 ELSE 0 END)  AS newWords,
        SUM(CASE WHEN wp.status = 'repeat'  THEN 1 ELSE 0 END)  AS repeatWords,
        COALESCE(dus.isFavorite,  0)                             AS isFavorite,
        COALESCE(dus.status,     'new')                          AS deckStatus,
        dus.startedAt,
        dus.completedAt
      FROM decks d
      LEFT JOIN word_progress      wp  ON wp.deckId  = d.id
      LEFT JOIN deck_user_settings dus ON dus.deckId = d.id
      GROUP BY d.id
      ORDER BY
        COALESCE(dus.isFavorite, 0) DESC,
        d.sortOrder ASC,
        d.createdAt ASC;
    `);

    return (result.rows ?? []).map((row) => ({
      id:           row.id           as number,
      title:        row.title        as string,
      icon:         row.icon         as string,
      level:        row.level        as string | null,
      groupId:      row.groupId      as number | null,
      totalWords:   (row.totalWords   as number) ?? 0,
      learnedWords: (row.learnedWords as number) ?? 0,
      newWords:     (row.newWords     as number) ?? 0,
      repeatWords:  (row.repeatWords  as number) ?? 0,
      isFavorite:   row.isFavorite   === 1,
      status:       row.deckStatus   as DeckUserStatus,
      // startedAt:    row.startedAt    as number | null,
      // completedAt:  row.completedAt  as number | null,
      languageCode: row.languageCode as string,
      sortOrder:    row.sortOrder    as number,
    }));
  }

  /**
   * Groups with their decks attached. `decks` may be passed in by a caller
   * that already loaded them (HomeRepository does), to avoid running the
   * aggregate deck query twice for one screen.
   */
  async getAllGrouped(decks?: Deck[]): Promise<DeckGroup[]> {
    const db = getDatabase();

    const groupsResult = await db.execute(
      'SELECT * FROM deck_groups ORDER BY sortOrder ASC;'
    );
    const groups = groupsResult.rows ?? [];
    const allDecks = decks ?? (await this.getAll());

    return groups.map((g) => ({
      id:        g.id        as number,
      title:     g.title     as string,
      icon:      g.icon      as string,
      sortOrder: g.sortOrder as number,
      decks:     allDecks.filter((d) => d.groupId === g.id),
    }));
  }

  async toggleFavorite(deckId: number, current: boolean): Promise<void> {
    const db = getDatabase();
    await db.execute(
      'UPDATE deck_user_settings SET isFavorite = ? WHERE deckId = ?;',
      [current ? 0 : 1, deckId]
    );
  }

  async updateStatus(
    deckId: number,
    status: DeckUserStatus
  ): Promise<void> {
    const db = getDatabase();
    const now = Date.now();

    const startedAt   = status === 'in_progress' ? now : null;
    const completedAt = status === 'completed'   ? now : null;

    await db.execute(
      `UPDATE deck_user_settings
       SET status = ?, startedAt = COALESCE(startedAt, ?), completedAt = ?
       WHERE deckId = ?;`,
      [status, startedAt, completedAt, deckId]
    );
  }

  // Mark deck as started when user begins a session
  async markAsStarted(deckId: number, currentStatus: DeckUserStatus): Promise<void> {
    if (currentStatus !== 'new') return;
    await this.updateStatus(deckId, 'in_progress');
  }
}

export const deckRepository = new DeckRepository();