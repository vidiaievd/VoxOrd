import type { VocabularyItemDisplay } from '../../api/vocabulary';
import { filterItems } from './filterItems';

function item(word: string, translation: string | null): VocabularyItemDisplay {
  return {
    itemId: word,
    listId: 'l',
    word,
    position: 0,
    partOfSpeech: null,
    ipaTranscription: null,
    pronunciationAudioMediaId: null,
    grammaticalProperties: null,
    register: null,
    notes: null,
    translation:
      translation === null
        ? null
        : {
            id: word,
            language: 'ru',
            primaryTranslation: translation,
            alternativeTranslations: [],
            definition: null,
            usageNotes: null,
            falseFriendWarning: null,
            fallbackUsed: false,
          },
    immersionMode: false,
    examples: [],
  };
}

describe('filterItems', () => {
  const items = [item('hus', 'дом'), item('bil', 'машина'), item('husk', null)];

  it('returns everything for an empty or blank query', () => {
    expect(filterItems(items, '')).toHaveLength(3);
    expect(filterItems(items, '   ')).toHaveLength(3);
  });

  it('matches the word, ignoring case', () => {
    expect(filterItems(items, 'HUS').map(i => i.word)).toEqual(['hus', 'husk']);
  });

  it('matches the translation too', () => {
    expect(filterItems(items, 'маши').map(i => i.word)).toEqual(['bil']);
  });

  it('finds nothing for a miss', () => {
    expect(filterItems(items, 'xyz')).toEqual([]);
  });
});
