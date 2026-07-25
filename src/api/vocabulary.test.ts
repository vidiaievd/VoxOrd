import {
  parseGrammaticalForms,
  humanizeFormKey,
  formatTranslation,
  type VocabularyItemDisplay,
} from './vocabulary';

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
    translation: null,
    immersionMode: false,
    examples: [],
    ...overrides,
  };
}

describe('parseGrammaticalForms', () => {
  it('returns an empty list for null/undefined/non-object input', () => {
    expect(parseGrammaticalForms(null)).toEqual([]);
    expect(parseGrammaticalForms(undefined)).toEqual([]);
  });

  it('flattens the flat scalar shape used by the seeded courses', () => {
    // Real shape from prisma/data/ny-i-norge-a2/vocab.json.
    expect(
      parseGrammaticalForms({
        verb_class: 'weak_1',
        present_tense: 'danser',
        past_tense: 'danset',
        perfect_tense: 'danset',
      }),
    ).toEqual([
      { key: 'verb_class', value: 'weak_1' },
      { key: 'present_tense', value: 'danser' },
      { key: 'past_tense', value: 'danset' },
      { key: 'perfect_tense', value: 'danset' },
    ]);
  });

  it('preserves key order', () => {
    const forms = parseGrammaticalForms({ b: '2', a: '1', c: '3' });
    expect(forms.map((f) => f.key)).toEqual(['b', 'a', 'c']);
  });

  it('flattens the web `forms` pair-array shape', () => {
    expect(parseGrammaticalForms({ forms: [['Entall', 'en bok'], ['Flertall', 'bøker']] })).toEqual([
      { key: 'Entall#0', value: 'en bok' },
      { key: 'Flertall#1', value: 'bøker' },
    ]);
  });

  it('handles both shapes present at once', () => {
    const forms = parseGrammaticalForms({
      gender: 'neuter',
      forms: [['Bestemt', 'huset']],
    });
    expect(forms).toEqual([
      { key: 'gender', value: 'neuter' },
      { key: 'Bestemt#0', value: 'huset' },
    ]);
  });

  it('keeps numbers and booleans but drops empty, null and nested values', () => {
    expect(
      parseGrammaticalForms({
        syllables: 2,
        irregular: true,
        blank: '   ',
        missing: null,
        nested: { a: 1 },
        list: [1, 2],
      }),
    ).toEqual([
      { key: 'syllables', value: '2' },
      { key: 'irregular', value: 'true' },
    ]);
  });

  it('ignores malformed entries inside a `forms` array', () => {
    expect(
      parseGrammaticalForms({
        forms: ['not-a-pair', ['OnlyLabel'], [42, 'x'], ['Good', 'value']],
      }),
    ).toEqual([{ key: 'Good#3', value: 'value' }]);
  });

  it('truncates absurdly long values instead of dropping them', () => {
    const [form] = parseGrammaticalForms({ note: 'x'.repeat(500) });
    expect(form.value).toHaveLength(200);
  });
});

describe('humanizeFormKey', () => {
  it('turns snake_case into a sentence-cased label', () => {
    expect(humanizeFormKey('present_tense')).toBe('Present tense');
    expect(humanizeFormKey('verb-class')).toBe('Verb class');
  });

  it('strips the positional suffix added for `forms` pairs', () => {
    expect(humanizeFormKey('Entall#0')).toBe('Entall');
  });

  it('leaves an already-readable label alone', () => {
    expect(humanizeFormKey('Bestemt form')).toBe('Bestemt form');
  });
});

describe('formatTranslation', () => {
  it('returns null when there is no translation', () => {
    expect(formatTranslation(makeItem())).toBeNull();
  });

  it('returns null in immersion mode even if a translation is present', () => {
    const item = makeItem({
      immersionMode: true,
      translation: {
        id: 't1',
        language: 'ru',
        primaryTranslation: 'танцевать',
        alternativeTranslations: [],
        definition: null,
        usageNotes: null,
        falseFriendWarning: null,
        fallbackUsed: false,
      },
    });
    expect(formatTranslation(item)).toBeNull();
  });

  it('joins the primary translation with its alternatives', () => {
    const item = makeItem({
      translation: {
        id: 't1',
        language: 'ru',
        primaryTranslation: 'танцевать',
        alternativeTranslations: ['плясать', '  '],
        definition: null,
        usageNotes: null,
        falseFriendWarning: null,
        fallbackUsed: false,
      },
    });
    expect(formatTranslation(item)).toBe('танцевать, плясать');
  });
});
