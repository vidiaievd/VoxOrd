import { aggregateStudyNow } from './studyNow';

describe('aggregateStudyNow', () => {
  it('sums repeatWords across decks', () => {
    expect(aggregateStudyNow([3, 0, 5], 2)).toEqual({
      localDue: 8,
      courseDue: 2,
      totalDue: 10,
    });
  });

  it('handles no decks', () => {
    expect(aggregateStudyNow([], 4)).toEqual({
      localDue: 0,
      courseDue: 4,
      totalDue: 4,
    });
  });

  it('handles nothing due anywhere', () => {
    expect(aggregateStudyNow([0, 0], 0)).toEqual({
      localDue: 0,
      courseDue: 0,
      totalDue: 0,
    });
  });

  it('clamps a negative course due count to zero', () => {
    expect(aggregateStudyNow([1], -1)).toEqual({
      localDue: 1,
      courseDue: 0,
      totalDue: 1,
    });
  });
});
