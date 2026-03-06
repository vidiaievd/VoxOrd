import { DB, WordLevel } from './types';

interface SeedGroup {
  title: string;
  icon: string;
  sortOrder: number;
}

interface SeedDeck {
  title: string;
  icon: string;
  level: WordLevel;
  groupIndex: number;
  sortOrder: number;
}

interface SeedWord {
  word: string;
  level: WordLevel;
  partOfSpeech: 'noun' | 'verb' | 'adjective' | 'adverb' | 'phrase';
  gender?: 'masculine' | 'feminine' | 'neuter';
  ordbokenUrl?: string;
  forms: Record<string, string>;
  translations: { ru: string; uk: string };
  deckIndices: number[];
}

const GROUPS: SeedGroup[] = [
  { title: 'Повседневное',  icon: '🏠', sortOrder: 0 },
  { title: 'Технологии',    icon: '💻', sortOrder: 1 },
  { title: 'Еда',           icon: '🍽️', sortOrder: 2 },
];

const DECKS: SeedDeck[] = [
  { title: 'Базовый норвежский', icon: '🇳🇴', level: 'A1', groupIndex: 0, sortOrder: 0 },
  { title: 'Технологии',         icon: '💻',  level: 'B1', groupIndex: 1, sortOrder: 0 },
  { title: 'Еда и быт',          icon: '🍽️', level: 'A1', groupIndex: 2, sortOrder: 0 },
];

const WORDS: SeedWord[] = [
  {
    word: 'hus',
    level: 'A1',
    partOfSpeech: 'noun',
    gender: 'neuter',
    ordbokenUrl: 'https://ordboken.no/hus',
    forms: {
      singular_indefinite: 'hus',
      singular_definite:   'huset',
      plural_indefinite:   'hus',
      plural_definite:     'husene',
    },
    translations: { ru: 'дом', uk: 'будинок' },
    deckIndices: [0],
  },
  {
    word: 'bil',
    level: 'A1',
    partOfSpeech: 'noun',
    gender: 'masculine',
    ordbokenUrl: 'https://ordboken.no/bil',
    forms: {
      singular_indefinite: 'bil',
      singular_definite:   'bilen',
      plural_indefinite:   'biler',
      plural_definite:     'bilene',
    },
    translations: { ru: 'машина', uk: 'машина' },
    deckIndices: [0],
  },
  {
    word: 'mat',
    level: 'A1',
    partOfSpeech: 'noun',
    gender: 'masculine',
    ordbokenUrl: 'https://ordboken.no/mat',
    forms: {
      singular_indefinite: 'mat',
      singular_definite:   'maten',
      plural_indefinite:   'mater',
      plural_definite:     'matene',
    },
    translations: { ru: 'еда', uk: 'їжа' },
    deckIndices: [0, 2],
  },
  {
    word: 'vann',
    level: 'A1',
    partOfSpeech: 'noun',
    gender: 'neuter',
    ordbokenUrl: 'https://ordboken.no/vann',
    forms: {
      singular_indefinite: 'vann',
      singular_definite:   'vannet',
      plural_indefinite:   'vann',
      plural_definite:     'vannene',
    },
    translations: { ru: 'вода', uk: 'вода' },
    deckIndices: [0, 2],
  },
  {
    word: 'å være',
    level: 'A1',
    partOfSpeech: 'verb',
    ordbokenUrl: 'https://ordboken.no/v%C3%A6re',
    forms: {
      infinitive: 'å være',
      present:    'er',
      past:       'var',
      perfect:    'har vært',
      imperative: 'vær',
    },
    translations: { ru: 'быть', uk: 'бути' },
    deckIndices: [0],
  },
  {
    word: 'å ha',
    level: 'A1',
    partOfSpeech: 'verb',
    ordbokenUrl: 'https://ordboken.no/ha',
    forms: {
      infinitive: 'å ha',
      present:    'har',
      past:       'hadde',
      perfect:    'har hatt',
      imperative: 'ha',
    },
    translations: { ru: 'иметь', uk: 'мати' },
    deckIndices: [0],
  },
  {
    word: 'å gjøre',
    level: 'A1',
    partOfSpeech: 'verb',
    ordbokenUrl: 'https://ordboken.no/gj%C3%B8re',
    forms: {
      infinitive: 'å gjøre',
      present:    'gjør',
      past:       'gjorde',
      perfect:    'har gjort',
      imperative: 'gjør',
    },
    translations: { ru: 'делать', uk: 'робити' },
    deckIndices: [0],
  },
  {
    word: 'datamaskin',
    level: 'B1',
    partOfSpeech: 'noun',
    gender: 'masculine',
    ordbokenUrl: 'https://ordboken.no/datamaskin',
    forms: {
      singular_indefinite: 'datamaskin',
      singular_definite:   'datamaskinen',
      plural_indefinite:   'datamaskiner',
      plural_definite:     'datamaskinene',
    },
    translations: { ru: 'компьютер', uk: 'комп\'ютер' },
    deckIndices: [1],
  },
  {
    word: 'nettside',
    level: 'B1',
    partOfSpeech: 'noun',
    gender: 'masculine',
    ordbokenUrl: 'https://ordboken.no/nettside',
    forms: {
      singular_indefinite: 'nettside',
      singular_definite:   'nettsiden',
      plural_indefinite:   'nettsider',
      plural_definite:     'nettsidene',
    },
    translations: { ru: 'веб-сайт', uk: 'веб-сайт' },
    deckIndices: [1],
  },
  {
    word: 'brød',
    level: 'A1',
    partOfSpeech: 'noun',
    gender: 'neuter',
    ordbokenUrl: 'https://ordboken.no/br%C3%B8d',
    forms: {
      singular_indefinite: 'brød',
      singular_definite:   'brødet',
      plural_indefinite:   'brød',
      plural_definite:     'brødene',
    },
    translations: { ru: 'хлеб', uk: 'хліб' },
    deckIndices: [2],
  },
  {
    word: 'fisk',
    level: 'A1',
    partOfSpeech: 'noun',
    gender: 'masculine',
    ordbokenUrl: 'https://ordboken.no/fisk',
    forms: {
      singular_indefinite: 'fisk',
      singular_definite:   'fisken',
      plural_indefinite:   'fisker',
      plural_definite:     'fiskene',
    },
    translations: { ru: 'рыба', uk: 'риба' },
    deckIndices: [2],
  },
];

export async function seedIfEmpty(db: DB): Promise<void> {
  const result = await db.execute('SELECT COUNT(*) as count FROM decks;');
  const count = (result.rows?.[0]?.count as number) ?? 0;

  if (count > 0) {
    console.log('[DB] Seed skipped, data exists');
    return;
  }

  const now = Date.now();

  // 1. Groups
  const groupIds: number[] = [];
  for (const group of GROUPS) {
    await db.execute(
      'INSERT INTO deck_groups (title, icon, sortOrder, createdAt) VALUES (?, ?, ?, ?);',
      [group.title, group.icon, group.sortOrder, now]
    );
    const r = await db.execute('SELECT last_insert_rowid() as id;');
    groupIds.push(r.rows?.[0]?.id as number);
  }

  // 2. Decks + user settings
  const deckIds: number[] = [];
  for (const deck of DECKS) {
    const groupId = groupIds[deck.groupIndex];
    await db.execute(
      `INSERT INTO decks
         (groupId, title, icon, languageCode, level, sortOrder, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [groupId, deck.title, deck.icon, 'no', deck.level, deck.sortOrder, now]
    );
    const r = await db.execute('SELECT last_insert_rowid() as id;');
    const deckId = r.rows?.[0]?.id as number;
    deckIds.push(deckId);

    // Init user settings for each deck
    await db.execute(
      `INSERT INTO deck_user_settings (deckId, isFavorite, status)
       VALUES (?, 0, 'new');`,
      [deckId]
    );
  }

  // 3. Words
  for (const entry of WORDS) {
    await db.execute(
      `INSERT INTO words
         (word, languageCode, partOfSpeech, gender, level, ordbokenUrl, imageUrl, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        entry.word,
        'no',
        entry.partOfSpeech,
        entry.gender ?? null,
        entry.level,
        entry.ordbokenUrl ?? null,
        null,
        now,
      ]
    );
    const wr = await db.execute('SELECT last_insert_rowid() as id;');
    const wordId = wr.rows?.[0]?.id as number;

    // Forms
    for (const [formType, form] of Object.entries(entry.forms)) {
      await db.execute(
        'INSERT INTO word_forms (wordId, formType, form) VALUES (?, ?, ?);',
        [wordId, formType, form]
      );
    }

    // Translations
    await db.execute(
      'INSERT INTO translations (wordId, languageCode, translation) VALUES (?, ?, ?);',
      [wordId, 'ru', entry.translations.ru]
    );
    await db.execute(
      'INSERT INTO translations (wordId, languageCode, translation) VALUES (?, ?, ?);',
      [wordId, 'uk', entry.translations.uk]
    );

    // Decks + progress
    for (const deckIndex of entry.deckIndices) {
      const deckId = deckIds[deckIndex];
      await db.execute(
        'INSERT INTO deck_words (deckId, wordId) VALUES (?, ?);',
        [deckId, wordId]
      );
      await db.execute(
        'INSERT INTO word_progress (wordId, deckId, status) VALUES (?, ?, ?);',
        [wordId, deckId, 'new']
      );
    }
  }

  console.log(`[DB] Seeded ${GROUPS.length} groups, ${DECKS.length} decks, ${WORDS.length} words`);
}