import type { Deck } from '../repositories/DeckRepository';
import { orderDecks } from './usePracticeHome';

jest.mock('./useCourseReviewSets', () => ({ useCourseReviewSets: jest.fn() }));
jest.mock('./useSettings', () => ({ useSettings: jest.fn() }));
jest.mock('../api/personalVocabulary', () => ({ listMyWords: jest.fn() }));
jest.mock('../repositories/DeckRepository', () => ({ deckRepository: {} }));

const deck = (id: number, repeatWords: number) => ({ id, repeatWords }) as Deck;

describe('orderDecks', () => {
  it('puts sets with something due first and keeps the given order within each group', () => {
    expect(
      orderDecks([deck(1, 0), deck(2, 3), deck(3, 0), deck(4, 1)]).map(d => d.id),
    ).toEqual([2, 4, 1, 3]);
  });

  it('does not mutate its input', () => {
    const input = [deck(1, 0), deck(2, 1)];
    orderDecks(input);
    expect(input.map(d => d.id)).toEqual([1, 2]);
  });
});
