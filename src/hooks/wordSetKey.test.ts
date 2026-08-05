import { wordSetKey } from './wordSetKey';

describe('wordSetKey', () => {
  it('is the same for the same set in a different order', () => {
    expect(wordSetKey([3, 1, 2])).toBe(wordSetKey([1, 2, 3]));
  });

  it('differs when the set itself differs', () => {
    expect(wordSetKey([1, 2, 3])).not.toBe(wordSetKey([1, 2, 4]));
    expect(wordSetKey([1, 2])).not.toBe(wordSetKey([1, 2, 3]));
  });

  it('does not confuse a missing override with an empty one', () => {
    // The repositories read them differently — whole deck vs. LIMIT 0.
    expect(wordSetKey(undefined)).not.toBe(wordSetKey([]));
  });

  it('sorts numerically, not as text', () => {
    expect(wordSetKey([2, 10])).toBe(wordSetKey([10, 2]));
    expect(wordSetKey([2, 10])).toBe('2,10');
  });

  it('leaves the caller’s array untouched', () => {
    const ids = [3, 1, 2];
    wordSetKey(ids);
    expect(ids).toEqual([3, 1, 2]);
  });
});
