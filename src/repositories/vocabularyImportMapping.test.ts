import {
  mapPartOfSpeech,
  mapGender,
  mapFormType,
  buildTranslations,
  buildForms,
  buildExamples,
  buildImportPlan,
} from './vocabularyImportMapping';
import type {
  VocabularyItemDisplay,
  VocabularyListReaderContent,
  VocabularyListSummary,
} from '../api/vocabulary';

function makeItem(overrides: Partial<VocabularyItemDisplay> = {}): VocabularyItemDisplay {
  return {
    itemId: 'item-1',
    listId: 'list-1',
    word: 'danse',
    position: 0,
    partOfSpeech: 'verb',
    ipaTranscription: null,
    pronunciationAudioMediaId: null,
    grammaticalProperties: null,
    register: null,
    notes: null,
    translation: {
      id: 'tr-1',
      language: 'ru',
      primaryTranslation: 'танцевать',
      alternativeTranslations: [],
      definition: null,
      usageNotes: null,
      falseFriendWarning: null,
      fallbackUsed: false,
    },
    immersionMode: false,
    examples: [],
    ...overrides,
  };
}

const list: VocabularyListSummary = {
  id: 'list-1',
  slug: 'leksjon-17-ord',
  title: 'Leksjon 17 — ord',
  description: null,
  targetLanguage: 'NO',
  difficultyLevel: 'A2',
  createdAt: '2026-07-01T00:00:00.000Z',
};

function makeReader(items: VocabularyItemDisplay[]): VocabularyListReaderContent {
  return { id: 'list-1', title: 'Leksjon 17 — ord', items };
}

describe('mapPartOfSpeech', () => {
  it('keeps the four values both schemas share', () => {
    expect(mapPartOfSpeech('noun')).toBe('noun');
    expect(mapPartOfSpeech('VERB')).toBe('verb');
    expect(mapPartOfSpeech('adjective')).toBe('adjective');
    expect(mapPartOfSpeech('adverb')).toBe('adverb');
  });

  it('falls back to `phrase` for platform-only values and for nothing at all', () => {
    for (const pos of [
      'pronoun',
      'preposition',
      'conjunction',
      'interjection',
      'numeral',
      'particle',
      'other',
      'phrase',
    ]) {
      expect(mapPartOfSpeech(pos)).toBe('phrase');
    }
    expect(mapPartOfSpeech(null)).toBe('phrase');
    expect(mapPartOfSpeech(undefined)).toBe('phrase');
  });
});

describe('mapGender', () => {
  it('reads a recognized gender out of the properties blob', () => {
    expect(mapGender({ gender: 'neuter' })).toBe('neuter');
    expect(mapGender({ gender: 'Masculine' })).toBe('masculine');
  });

  it('returns null for missing, non-string or unrecognized values', () => {
    expect(mapGender(null)).toBeNull();
    expect(mapGender({})).toBeNull();
    expect(mapGender({ gender: 'common' })).toBeNull();
    expect(mapGender({ gender: 3 })).toBeNull();
  });
});

describe('mapFormType', () => {
  it('normalizes known platform keys to the local form vocabulary', () => {
    expect(mapFormType('present_tense')).toBe('present');
    expect(mapFormType('past_tense')).toBe('past');
    expect(mapFormType('perfect_tense')).toBe('perfect');
  });

  it('keeps unknown keys instead of dropping them', () => {
    expect(mapFormType('verb_class')).toBe('verb_class');
    expect(mapFormType('Bestemt form#2')).toBe('bestemt_form');
  });
});

describe('buildTranslations', () => {
  it('returns nothing when there is no translation', () => {
    expect(buildTranslations(makeItem({ translation: null }), 'ru')).toEqual([]);
  });

  it('returns nothing when the translation text is blank', () => {
    const item = makeItem({
      translation: {
        id: 'tr-1',
        language: 'ru',
        primaryTranslation: '   ',
        alternativeTranslations: [],
        definition: null,
        usageNotes: null,
        falseFriendWarning: null,
        fallbackUsed: false,
      },
    });
    expect(buildTranslations(item, 'ru')).toEqual([]);
  });

  it('writes one row when the server answered in the requested language', () => {
    expect(buildTranslations(makeItem(), 'ru')).toEqual([
      { languageCode: 'ru', translation: 'танцевать' },
    ]);
  });

  it('joins alternatives into the single local translation column', () => {
    const item = makeItem({
      translation: {
        id: 'tr-1',
        language: 'ru',
        primaryTranslation: 'танцевать',
        alternativeTranslations: ['плясать'],
        definition: null,
        usageNotes: null,
        falseFriendWarning: null,
        fallbackUsed: false,
      },
    });
    expect(buildTranslations(item, 'ru')).toEqual([
      { languageCode: 'ru', translation: 'танцевать, плясать' },
    ]);
  });

  it('writes both the requested and the actual language when the server fell back', () => {
    const item = makeItem({
      translation: {
        id: 'tr-1',
        language: 'EN',
        primaryTranslation: 'to dance',
        alternativeTranslations: [],
        definition: null,
        usageNotes: null,
        falseFriendWarning: null,
        fallbackUsed: true,
      },
    });
    // The `ru` row is what makes the word reachable — getNextWord inner-joins
    // translations on the UI language.
    expect(buildTranslations(item, 'ru')).toEqual([
      { languageCode: 'ru', translation: 'to dance' },
      { languageCode: 'en', translation: 'to dance' },
    ]);
  });
});

describe('buildForms', () => {
  it('maps the seeded flat properties into local form rows', () => {
    const item = makeItem({
      grammaticalProperties: {
        verb_class: 'weak_1',
        present_tense: 'danser',
        past_tense: 'danset',
        perfect_tense: 'danset',
      },
    });
    expect(buildForms(item)).toEqual([
      { formType: 'verb_class', form: 'weak_1' },
      { formType: 'present', form: 'danser' },
      { formType: 'past', form: 'danset' },
      { formType: 'perfect', form: 'danset' },
    ]);
  });

  it('excludes gender, which lives on the word row instead', () => {
    const item = makeItem({ grammaticalProperties: { gender: 'neuter', plural_form: 'hus' } });
    expect(buildForms(item)).toEqual([{ formType: 'plural', form: 'hus' }]);
  });

  it('de-duplicates form types, since the table is unique on (wordId, formType)', () => {
    const item = makeItem({
      grammaticalProperties: { present_tense: 'danser', 'Present tense': 'danser (alt)' },
    });
    expect(buildForms(item)).toEqual([{ formType: 'present', form: 'danser' }]);
  });

  it('returns nothing when there are no properties', () => {
    expect(buildForms(makeItem())).toEqual([]);
  });
});

describe('buildExamples', () => {
  it('maps example text and its translation', () => {
    const item = makeItem({
      examples: [
        {
          id: 'ex-1',
          exampleText: '  Vi danser hver fredag.  ',
          position: 0,
          audioMediaId: null,
          contextNote: null,
          translation: {
            id: 'ext-1',
            language: 'RU',
            translatedText: 'Мы танцуем каждую пятницу.',
            fallbackUsed: false,
          },
          immersionMode: false,
        },
      ],
    });
    expect(buildExamples(item, 'no')).toEqual([
      {
        sentence: 'Vi danser hver fredag.',
        sentenceLanguage: 'no',
        translations: [{ languageCode: 'ru', translation: 'Мы танцуем каждую пятницу.' }],
      },
    ]);
  });

  it('keeps the sentence but drops the translation in immersion mode', () => {
    const item = makeItem({
      examples: [
        {
          id: 'ex-1',
          exampleText: 'Vi danser.',
          position: 0,
          audioMediaId: null,
          contextNote: null,
          translation: null,
          immersionMode: true,
        },
      ],
    });
    expect(buildExamples(item, 'no')[0].translations).toEqual([]);
  });

  it('drops blank sentences', () => {
    const item = makeItem({
      examples: [
        {
          id: 'ex-1',
          exampleText: '   ',
          position: 0,
          audioMediaId: null,
          contextNote: null,
          translation: null,
          immersionMode: false,
        },
      ],
    });
    expect(buildExamples(item, 'no')).toEqual([]);
  });
});

describe('buildImportPlan', () => {
  it('describes the deck from the list metadata', () => {
    const plan = buildImportPlan(list, makeReader([makeItem()]), 'ru');
    expect(plan.platformListId).toBe('list-1');
    expect(plan.deckTitle).toBe('Leksjon 17 — ord');
    expect(plan.deckLanguageCode).toBe('no');
    expect(plan.deckLevel).toBe('A2');
  });

  it('maps a seeded item end to end', () => {
    const item = makeItem({
      grammaticalProperties: { present_tense: 'danser' },
    });
    const [word] = buildImportPlan(list, makeReader([item]), 'ru').words;
    expect(word).toEqual({
      platformItemId: 'item-1',
      word: 'danse',
      languageCode: 'no',
      partOfSpeech: 'verb',
      gender: null,
      level: 'A2',
      translations: [{ languageCode: 'ru', translation: 'танцевать' }],
      forms: [{ formType: 'present', form: 'danser' }],
      examples: [],
    });
  });

  it('skips untranslatable items and counts them instead of importing dead rows', () => {
    const plan = buildImportPlan(
      list,
      makeReader([
        makeItem(),
        makeItem({ itemId: 'item-2', word: 'lysere tider', translation: null }),
      ]),
      'ru',
    );
    expect(plan.words).toHaveLength(1);
    expect(plan.skippedNoTranslation).toBe(1);
  });

  it('drops blank words and duplicate item ids', () => {
    const plan = buildImportPlan(
      list,
      makeReader([
        makeItem(),
        makeItem({ word: '   ' }),
        makeItem({ itemId: 'item-1', word: 'danse' }),
      ]),
      'ru',
    );
    expect(plan.words).toHaveLength(1);
  });

  it('falls back to the list title when the reader has none', () => {
    const plan = buildImportPlan(list, { id: 'list-1', title: '  ', items: [] }, 'ru');
    expect(plan.deckTitle).toBe('Leksjon 17 — ord');
    expect(plan.words).toEqual([]);
  });
});
