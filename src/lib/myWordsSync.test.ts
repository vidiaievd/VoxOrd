import { ApiError } from '../api/client';
import type { PersonalWord } from '../api/personalVocabulary';

jest.mock('../api/personalVocabulary', () => ({
  listMyWords: jest.fn(),
  getMyWordsReader: jest.fn(),
}));
jest.mock('../api/srs', () => ({
  CARD_STATES_MAX_IDS: 500,
  getCardStates: jest.fn(),
  introduceCard: jest.fn(),
  suspendCard: jest.fn(),
  unsuspendCard: jest.fn(),
}));
jest.mock('../repositories/VocabularyImportRepository', () => ({
  vocabularyImportRepository: {
    listDeckListIds: jest.fn(),
    importList: jest.fn(),
  },
}));
jest.mock('../i18n', () => ({ translate: (path: string) => path }));

import { getMyWordsReader, listMyWords } from '../api/personalVocabulary';
import {
  getCardStates,
  introduceCard,
  suspendCard,
  unsuspendCard,
} from '../api/srs';
import { vocabularyImportRepository } from '../repositories/VocabularyImportRepository';
import { removeMyWord, syncMyWords } from './myWordsSync';

const mockList = listMyWords as jest.Mock;
const mockReader = getMyWordsReader as jest.Mock;
const mockStates = getCardStates as jest.Mock;
const mockIntroduce = introduceCard as jest.Mock;
const repo = vocabularyImportRepository as unknown as {
  listDeckListIds: jest.Mock;
  importList: jest.Mock;
};

const word = (
  itemId: string,
  status: 'pending' | 'resolved',
  targetLanguage = 'nb',
) =>
  ({
    entryId: `e-${itemId}`,
    vocabularyItemId: itemId,
    status,
    targetLanguage,
  } as PersonalWord);

beforeEach(() => {
  jest.resetAllMocks();
  repo.listDeckListIds.mockResolvedValue([]);
  repo.importList.mockResolvedValue({});
  mockReader.mockImplementation(async ({ targetLanguage }) => ({
    id: `personal:${targetLanguage}`,
    title: 'My words',
    items: [],
  }));
  mockStates.mockResolvedValue({ states: [] });
  mockIntroduce.mockResolvedValue(undefined);
});

describe('syncMyWords', () => {
  it('imports a deck per language and introduces only translated words without a card', async () => {
    // Newest first, as the server lists them.
    mockList.mockResolvedValue([
      word('c', 'resolved'),
      word('b', 'pending'),
      word('a', 'resolved'),
    ]);
    mockStates.mockResolvedValue({
      states: [{ contentId: 'c', state: 'REVIEW' }],
    });

    const result = await syncMyWords('ru');

    expect(mockReader).toHaveBeenCalledWith({
      targetLanguage: 'nb',
      translationLanguage: 'ru',
    });
    expect(repo.importList).toHaveBeenCalledTimes(1);
    expect(mockStates).toHaveBeenCalledWith('VOCABULARY_WORD', ['a', 'c']);
    expect(mockIntroduce.mock.calls).toEqual([['VOCABULARY_WORD', 'a']]);
    expect(result.introduced).toBe(1);
    expect(result.limitReached).toBe(false);
  });

  it('stops at the day’s new-card limit and says so', async () => {
    mockList.mockResolvedValue([word('b', 'resolved'), word('a', 'resolved')]);
    mockIntroduce.mockRejectedValueOnce(
      new ApiError({ message: 'limit', status: 429 }),
    );

    const result = await syncMyWords('ru');

    expect(mockIntroduce).toHaveBeenCalledTimes(1);
    expect(result.limitReached).toBe(true);
  });

  it('empties the deck of a language whose words are all gone', async () => {
    mockList.mockResolvedValue([]);
    repo.listDeckListIds.mockResolvedValue(['personal:nb']);

    await syncMyWords('ru');

    expect(mockReader).toHaveBeenCalledWith({
      targetLanguage: 'nb',
      translationLanguage: 'ru',
    });
    expect(repo.importList).toHaveBeenCalledTimes(1);
    expect(mockStates).not.toHaveBeenCalled();
  });
});

describe('removeMyWord and coming back', () => {
  const own = { ...word('a', 'resolved'), ownWord: true } as PersonalWord;
  const fromCourse = {
    ...word('k', 'resolved'),
    ownWord: false,
  } as PersonalWord;

  it('suspends the card of a word of one’s own', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    mockStates.mockResolvedValue({
      states: [{ contentId: 'a', state: 'REVIEW' }],
    });
    mockIntroduce.mockResolvedValue({ id: 'card-a' });

    await removeMyWord(own, remove);

    expect(remove).toHaveBeenCalled();
    expect(suspendCard).toHaveBeenCalledWith('card-a');
  });

  it('leaves a course word’s card alone', async () => {
    await removeMyWord(fromCourse, jest.fn().mockResolvedValue(undefined));

    expect(mockStates).not.toHaveBeenCalled();
    expect(suspendCard).not.toHaveBeenCalled();
  });

  it('a word added again comes back into review', async () => {
    mockList.mockResolvedValue([word('a', 'resolved')]);
    mockStates.mockResolvedValue({
      states: [{ contentId: 'a', state: 'SUSPENDED' }],
    });
    mockIntroduce.mockResolvedValue({ id: 'card-a' });

    await syncMyWords('ru');

    expect(unsuspendCard).toHaveBeenCalledWith('card-a');
  });
});
