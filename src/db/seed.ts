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
  { title: 'Повседневное', icon: '🏠', sortOrder: 0 },
  { title: 'Технологии', icon: '💻', sortOrder: 1 },
  { title: 'Еда', icon: '🍽️', sortOrder: 2 },
];

const DECKS: SeedDeck[] = [
  {
    title: 'Базовый норвежский',
    icon: '🇳🇴',
    level: 'A1',
    groupIndex: 0,
    sortOrder: 0,
  },
  { title: 'Технологии', icon: '💻', level: 'B1', groupIndex: 1, sortOrder: 0 },
  { title: 'Еда и быт', icon: '🍽️', level: 'A1', groupIndex: 2, sortOrder: 0 },
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
      singular_definite: 'huset',
      plural_indefinite: 'hus',
      plural_definite: 'husene',
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
      singular_definite: 'bilen',
      plural_indefinite: 'biler',
      plural_definite: 'bilene',
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
      singular_definite: 'maten',
      plural_indefinite: 'mater',
      plural_definite: 'matene',
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
      singular_definite: 'vannet',
      plural_indefinite: 'vann',
      plural_definite: 'vannene',
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
      present: 'er',
      past: 'var',
      perfect: 'har vært',
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
      present: 'har',
      past: 'hadde',
      perfect: 'har hatt',
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
      present: 'gjør',
      past: 'gjorde',
      perfect: 'har gjort',
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
      singular_definite: 'datamaskinen',
      plural_indefinite: 'datamaskiner',
      plural_definite: 'datamaskinene',
    },
    translations: { ru: 'компьютер', uk: "комп'ютер" },
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
      singular_definite: 'nettsiden',
      plural_indefinite: 'nettsider',
      plural_definite: 'nettsidene',
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
      singular_definite: 'brødet',
      plural_indefinite: 'brød',
      plural_definite: 'brødene',
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
      singular_definite: 'fisken',
      plural_indefinite: 'fisker',
      plural_definite: 'fiskene',
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
      [group.title, group.icon, group.sortOrder, now],
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
      [groupId, deck.title, deck.icon, 'no', deck.level, deck.sortOrder, now],
    );
    const r = await db.execute('SELECT last_insert_rowid() as id;');
    const deckId = r.rows?.[0]?.id as number;
    deckIds.push(deckId);

    // Init user settings for each deck
    await db.execute(
      `INSERT INTO deck_user_settings (deckId, isFavorite, status)
       VALUES (?, 0, 'new');`,
      [deckId],
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
      ],
    );
    const wr = await db.execute('SELECT last_insert_rowid() as id;');
    const wordId = wr.rows?.[0]?.id as number;

    // Forms
    for (const [formType, form] of Object.entries(entry.forms)) {
      await db.execute(
        'INSERT INTO word_forms (wordId, formType, form) VALUES (?, ?, ?);',
        [wordId, formType, form],
      );
    }

    // Translations
    await db.execute(
      'INSERT INTO translations (wordId, languageCode, translation) VALUES (?, ?, ?);',
      [wordId, 'ru', entry.translations.ru],
    );
    await db.execute(
      'INSERT INTO translations (wordId, languageCode, translation) VALUES (?, ?, ?);',
      [wordId, 'uk', entry.translations.uk],
    );

    // Decks + progress
    for (const deckIndex of entry.deckIndices) {
      const deckId = deckIds[deckIndex];
      await db.execute(
        'INSERT INTO deck_words (deckId, wordId) VALUES (?, ?);',
        [deckId, wordId],
      );
      await db.execute(
        'INSERT INTO word_progress (wordId, deckId, status) VALUES (?, ?, ?);',
        [wordId, deckId, 'new'],
      );
    }

    // User profile
    const profileResult = await db.execute(
      'SELECT COUNT(*) as count FROM user_profile;',
    );
    if ((profileResult.rows?.[0]?.count as number) === 0) {
      await db.execute(
        `INSERT INTO user_profile (id, name, avatar, createdAt)
       VALUES (1, 'User', '👤', ?);`,
        [Date.now()],
      );
    }

    // Statistics
    const statsResult = await db.execute(
      'SELECT COUNT(*) as count FROM user_stats;',
    );
    if ((statsResult.rows?.[0]?.count as number) === 0) {
      await db.execute(
        `INSERT INTO user_stats
         (id, xp, streak, longestStreak, totalWordsLearned, totalSessions)
       VALUES (1, 0, 0, 0, 0, 0);`,
      );
    }

    // Daily goal
    const goalResult = await db.execute(
      'SELECT COUNT(*) as count FROM daily_goal;',
    );
    if ((goalResult.rows?.[0]?.count as number) === 0) {
      await db.execute(
        'INSERT INTO daily_goal (id, goal, updatedAt) VALUES (1, 20, ?);',
        [Date.now()],
      );
    }

    // ─── Word Examples ───────────────────────────────────────────────────────────
    const examplesCount = await db.execute(
      'SELECT COUNT(*) as count FROM word_examples;',
    );
    if ((examplesCount.rows?.[0]?.count as number) === 0) {
      const examples: Array<{
        wordId: number;
        sentence: string;
        translations: Array<{ languageCode: string; translation: string }>;
      }> = [
        {
          wordId: 1,
          sentence: 'Maten er veldig god i dag.',
          translations: [
            { languageCode: 'ru', translation: 'Еда сегодня очень вкусная.' },
            { languageCode: 'uk', translation: 'Їжа сьогодні дуже смачна.' },
            { languageCode: 'en', translation: 'The food is very good today.' },
          ],
        },
        {
          wordId: 1,
          sentence: 'Jeg lager mat til middag.',
          translations: [
            { languageCode: 'ru', translation: 'Я готовлю еду на ужин.' },
            { languageCode: 'uk', translation: 'Я готую їжу на вечерю.' },
            {
              languageCode: 'en',
              translation: 'I am cooking food for dinner.',
            },
          ],
        },
        {
          wordId: 2,
          sentence: 'Kan jeg få et glass vann?',
          translations: [
            { languageCode: 'ru', translation: 'Можно мне стакан воды?' },
            { languageCode: 'uk', translation: 'Чи можна мені склянку води?' },
            { languageCode: 'en', translation: 'Can I have a glass of water?' },
          ],
        },
        {
          wordId: 2,
          sentence: 'Vannet er kaldt.',
          translations: [
            { languageCode: 'ru', translation: 'Вода холодная.' },
            { languageCode: 'uk', translation: 'Вода холодна.' },
            { languageCode: 'en', translation: 'The water is cold.' },
          ],
        },
        {
          wordId: 3,
          sentence: 'Jeg har en ny bil.',
          translations: [
            { languageCode: 'ru', translation: 'У меня есть новая машина.' },
            { languageCode: 'uk', translation: 'У мене є нова машина.' },
            { languageCode: 'en', translation: 'I have a new car.' },
          ],
        },
        {
          wordId: 3,
          sentence: 'Bilen min er rød.',
          translations: [
            { languageCode: 'ru', translation: 'Моя машина красная.' },
            { languageCode: 'uk', translation: 'Моя машина червона.' },
            { languageCode: 'en', translation: 'My car is red.' },
          ],
        },
        {
          wordId: 4,
          sentence: 'Vi bor i et stort hus.',
          translations: [
            { languageCode: 'ru', translation: 'Мы живём в большом доме.' },
            {
              languageCode: 'uk',
              translation: 'Ми живемо у великому будинку.',
            },
            { languageCode: 'en', translation: 'We live in a big house.' },
          ],
        },
        {
          wordId: 5,
          sentence: 'Jeg er glad for å være her.',
          translations: [
            { languageCode: 'ru', translation: 'Я рад быть здесь.' },
            { languageCode: 'uk', translation: 'Я радий бути тут.' },
            { languageCode: 'en', translation: 'I am glad to be here.' },
          ],
        },
        {
          wordId: 6,
          sentence: 'Har du tid nå?',
          translations: [
            { languageCode: 'ru', translation: 'У тебя есть время сейчас?' },
            { languageCode: 'uk', translation: 'У тебе є час зараз?' },
            { languageCode: 'en', translation: 'Do you have time now?' },
          ],
        },
        {
          wordId: 7,
          sentence: 'Hva gjør du i helgen?',
          translations: [
            { languageCode: 'ru', translation: 'Что ты делаешь на выходных?' },
            { languageCode: 'uk', translation: 'Що ти робиш на вихідних?' },
            {
              languageCode: 'en',
              translation: 'What are you doing this weekend?',
            },
          ],
        },
        {
          wordId: 8,
          sentence: 'Det er en god idé.',
          translations: [
            { languageCode: 'ru', translation: 'Это хорошая идея.' },
            { languageCode: 'uk', translation: 'Це гарна ідея.' },
            { languageCode: 'en', translation: 'That is a good idea.' },
          ],
        },
        {
          wordId: 9,
          sentence: 'Oslo er en stor by.',
          translations: [
            { languageCode: 'ru', translation: 'Осло — большой город.' },
            { languageCode: 'uk', translation: 'Осло — велике місто.' },
            { languageCode: 'en', translation: 'Oslo is a big city.' },
          ],
        },
        {
          wordId: 10,
          sentence: 'Jeg har en ny telefon.',
          translations: [
            { languageCode: 'ru', translation: 'У меня новый телефон.' },
            { languageCode: 'uk', translation: 'У мене новий телефон.' },
            { languageCode: 'en', translation: 'I have a new phone.' },
          ],
        },
        {
          wordId: 11,
          sentence: 'Jeg jobber på datamaskinen.',
          translations: [
            { languageCode: 'ru', translation: 'Я работаю за компьютером.' },
            { languageCode: 'uk', translation: "Я працюю за комп'ютером." },
            { languageCode: 'en', translation: 'I work on the computer.' },
          ],
        },
      ];

      for (const ex of examples) {
        await db.execute(
          `INSERT INTO word_examples (wordId, sentence, sentenceLanguage, createdAt)
       VALUES (?, ?, 'no', ?);`,
          [ex.wordId, ex.sentence, Date.now()],
        );

        const exResult = await db.execute('SELECT last_insert_rowid() as id;');
        const exampleId = exResult.rows?.[0]?.id as number;

        for (const t of ex.translations) {
          await db.execute(
            `INSERT INTO word_example_translations (exampleId, languageCode, translation)
         VALUES (?, ?, ?);`,
            [exampleId, t.languageCode, t.translation],
          );
        }
      }
    }

    // ─── Word Relations ──────────────────────────────────────────────────────────
    const relationsCount = await db.execute(
      'SELECT COUNT(*) as count FROM word_relations;',
    );
    if ((relationsCount.rows?.[0]?.count as number) === 0) {
      const relations: Array<{
        wordId: number;
        relatedWordId: number;
        relationType: string;
        strength: number;
      }> = [
        // mat ↔ vann (еда и вода — категория "за столом")
        { wordId: 1, relatedWordId: 2, relationType: 'related', strength: 0.9 },
        { wordId: 2, relatedWordId: 1, relationType: 'related', strength: 0.9 },
        // mat → å gjøre (готовить еду)
        { wordId: 1, relatedWordId: 7, relationType: 'related', strength: 0.7 },
        // bil → å ha (иметь машину)
        { wordId: 3, relatedWordId: 6, relationType: 'related', strength: 0.6 },
        // hus → stor (большой дом)
        { wordId: 4, relatedWordId: 9, relationType: 'related', strength: 0.7 },
        // hus → ny (новый дом)
        {
          wordId: 4,
          relatedWordId: 10,
          relationType: 'related',
          strength: 0.6,
        },
        // å være ↔ å ha (базовые глаголы)
        { wordId: 5, relatedWordId: 6, relationType: 'related', strength: 0.8 },
        { wordId: 6, relatedWordId: 5, relationType: 'related', strength: 0.8 },
        // å være ↔ å gjøre (базовые глаголы)
        { wordId: 5, relatedWordId: 7, relationType: 'related', strength: 0.7 },
        { wordId: 7, relatedWordId: 5, relationType: 'related', strength: 0.7 },
        // god ↔ stor (прилагательные)
        {
          wordId: 8,
          relatedWordId: 9,
          relationType: 'category',
          strength: 0.6,
        },
        {
          wordId: 9,
          relatedWordId: 8,
          relationType: 'category',
          strength: 0.6,
        },
        // god ↔ ny (прилагательные)
        {
          wordId: 8,
          relatedWordId: 10,
          relationType: 'category',
          strength: 0.6,
        },
        {
          wordId: 10,
          relatedWordId: 8,
          relationType: 'category',
          strength: 0.6,
        },
        // stor ↔ ny (прилагательные)
        {
          wordId: 9,
          relatedWordId: 10,
          relationType: 'category',
          strength: 0.5,
        },
        {
          wordId: 10,
          relatedWordId: 9,
          relationType: 'category',
          strength: 0.5,
        },
        // datamaskin → ny (новый компьютер)
        {
          wordId: 11,
          relatedWordId: 10,
          relationType: 'related',
          strength: 0.7,
        },
        // datamaskin → å gjøre (работать за компьютером)
        {
          wordId: 11,
          relatedWordId: 7,
          relationType: 'related',
          strength: 0.6,
        },
      ];

      for (const rel of relations) {
        await db.execute(
          `INSERT OR IGNORE INTO word_relations
         (wordId, relatedWordId, relationType, strength)
       VALUES (?, ?, ?, ?);`,
          [rel.wordId, rel.relatedWordId, rel.relationType, rel.strength],
        );
      }
    }
  }

  // Context sentences — mark existing examples + add new ones
  const contextResult = await db.execute(
    `SELECT COUNT(*) as count FROM word_examples WHERE isContextSentence = 1;`,
  );
  if ((contextResult.rows?.[0]?.count as number) === 0) {
    const contextExamples: Array<{
      wordId: number;
      sentence: string;
      translations: Array<{ languageCode: string; translation: string }>;
    }> = [
      // hus (id: 1)
      {
        wordId: 1,
        sentence: 'De bor i et stort ___ utenfor byen.',
        translations: [
          {
            languageCode: 'ru',
            translation: 'Они живут в большом ___ за городом.',
          },
          {
            languageCode: 'uk',
            translation: 'Вони живуть у великому ___ за містом.',
          },
          {
            languageCode: 'en',
            translation: 'They live in a big ___ outside the city.',
          },
        ],
      },
      // bil (id: 2)
      {
        wordId: 2,
        sentence: 'Han kjører ___ til jobben hver dag.',
        translations: [
          {
            languageCode: 'ru',
            translation: 'Он едет на ___ на работу каждый день.',
          },
          {
            languageCode: 'uk',
            translation: 'Він їде на ___ на роботу щодня.',
          },
          {
            languageCode: 'en',
            translation: 'He drives a ___ to work every day.',
          },
        ],
      },
      // mat (id: 3)
      {
        wordId: 3,
        sentence: 'Jeg er sulten, kan du lage ___?',
        translations: [
          {
            languageCode: 'ru',
            translation: 'Я голоден, ты можешь приготовить ___?',
          },
          {
            languageCode: 'uk',
            translation: 'Я голодний, ти можеш приготувати ___?',
          },
          { languageCode: 'en', translation: 'I am hungry, can you make ___?' },
        ],
      },
      // vann (id: 4)
      {
        wordId: 4,
        sentence: 'Kan jeg få et glass ___?',
        translations: [
          { languageCode: 'ru', translation: 'Можно мне стакан ___?' },
          { languageCode: 'uk', translation: 'Можна мені склянку ___?' },
          { languageCode: 'en', translation: 'Can I have a glass of ___?' },
        ],
      },
      // å være (id: 5)
      {
        wordId: 5,
        sentence: 'Det er godt å ___ hjemme igjen.',
        translations: [
          { languageCode: 'ru', translation: 'Хорошо ___ снова дома.' },
          { languageCode: 'uk', translation: 'Добре ___ знову вдома.' },
          { languageCode: 'en', translation: 'It is good to ___ home again.' },
        ],
      },
      // å ha (id: 6)
      {
        wordId: 6,
        sentence: 'Jeg vil gjerne ___ en kopp kaffe.',
        translations: [
          { languageCode: 'ru', translation: 'Я хотел бы ___ чашку кофе.' },
          { languageCode: 'uk', translation: 'Я хотів би ___ чашку кави.' },
          {
            languageCode: 'en',
            translation: 'I would like to ___ a cup of coffee.',
          },
        ],
      },
      // å gjøre (id: 7)
      {
        wordId: 7,
        sentence: 'Hva skal vi ___ i helgen?',
        translations: [
          { languageCode: 'ru', translation: 'Что мы будем ___ на выходных?' },
          { languageCode: 'uk', translation: 'Що ми будемо ___ на вихідних?' },
          {
            languageCode: 'en',
            translation: 'What shall we ___ this weekend?',
          },
        ],
      },
      // datamaskin (id: 8)
      {
        wordId: 8,
        sentence: 'Jeg bruker ___ til å jobbe hjemmefra.',
        translations: [
          {
            languageCode: 'ru',
            translation: 'Я использую ___ для работы из дома.',
          },
          {
            languageCode: 'uk',
            translation: 'Я використовую ___ для роботи з дому.',
          },
          { languageCode: 'en', translation: 'I use a ___ to work from home.' },
        ],
      },
      // nettside (id: 9)
      {
        wordId: 9,
        sentence: 'Selskapet har en fin ___.',
        translations: [
          { languageCode: 'ru', translation: 'У компании красивый ___.' },
          { languageCode: 'uk', translation: 'У компанії гарний ___.' },
          { languageCode: 'en', translation: 'The company has a nice ___.' },
        ],
      },
      // brød (id: 10)
      {
        wordId: 10,
        sentence: 'Kan du kjøpe ___ på veien hjem?',
        translations: [
          {
            languageCode: 'ru',
            translation: 'Можешь купить ___ по дороге домой?',
          },
          {
            languageCode: 'uk',
            translation: 'Можеш купити ___ дорогою додому?',
          },
          {
            languageCode: 'en',
            translation: 'Can you buy ___ on the way home?',
          },
        ],
      },
      // fisk (id: 11)
      {
        wordId: 11,
        sentence: 'Vi spiser ___ til middag hver fredag.',
        translations: [
          {
            languageCode: 'ru',
            translation: 'Мы едим ___ на ужин каждую пятницу.',
          },
          {
            languageCode: 'uk',
            translation: "Ми їмо ___ на вечерю кожну п'ятницю.",
          },
          {
            languageCode: 'en',
            translation: 'We eat ___ for dinner every Friday.',
          },
        ],
      },
    ];
    for (const ex of contextExamples) {
      await db.execute(
        `INSERT INTO word_examples
         (wordId, sentence, sentenceLanguage, isContextSentence, createdAt)
       VALUES (?, ?, 'no', 1, ?);`,
        [ex.wordId, ex.sentence, Date.now()],
      );

      const exResult = await db.execute('SELECT last_insert_rowid() as id;');
      const exampleId = exResult.rows?.[0]?.id as number;

      for (const t of ex.translations) {
        await db.execute(
          `INSERT INTO word_example_translations
           (exampleId, languageCode, translation)
         VALUES (?, ?, ?);`,
          [exampleId, t.languageCode, t.translation],
        );
      }
    }
  }

  console.log(
    `[DB] Seeded ${GROUPS.length} groups, ${DECKS.length} decks, ${WORDS.length} words`,
  );
}
