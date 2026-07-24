import {
  buildMatchPairsAnswer,
  extractExpectedPairs,
  isLinkExpected,
  matchPairsCanSubmit,
  toggleLink,
  type MatchPairItem,
} from './matchPairs';

const leftItems: MatchPairItem[] = [
  { id: 'l1', text: 'frokost' },
  { id: 'l2', text: 'lekser' },
];

describe('toggleLink', () => {
  it('creates a new link', () => {
    expect(toggleLink({}, 'l1', 'r2')).toEqual({ l1: 'r2' });
  });

  it('unlinks when tapping the right item already linked to this left', () => {
    expect(toggleLink({ l1: 'r2' }, 'l1', 'r2')).toEqual({});
  });

  it('re-links to a different right item, replacing the old link', () => {
    expect(toggleLink({ l1: 'r2' }, 'l1', 'r4')).toEqual({ l1: 'r4' });
  });

  it('steals a right item from another left, unlinking the other left', () => {
    const links = { l1: 'r2', l2: 'r4' };
    expect(toggleLink(links, 'l1', 'r4')).toEqual({ l1: 'r4' });
  });

  it('leaves unrelated links untouched', () => {
    const links = { l1: 'r2', l2: 'r4' };
    expect(toggleLink(links, 'l1', 'r1')).toEqual({ l1: 'r1', l2: 'r4' });
  });

  it('never mutates the input object', () => {
    const links = { l1: 'r2' };
    const snapshot = { ...links };
    toggleLink(links, 'l1', 'r4');
    expect(links).toEqual(snapshot);
  });
});

describe('matchPairsCanSubmit / buildMatchPairsAnswer', () => {
  it('cannot submit until every left item has a link', () => {
    expect(matchPairsCanSubmit({ l1: 'r2' }, leftItems)).toBe(false);
    expect(matchPairsCanSubmit({ l1: 'r2', l2: 'r4' }, leftItems)).toBe(true);
  });

  it('is false for an empty left_items set', () => {
    expect(matchPairsCanSubmit({}, [])).toBe(false);
  });

  it('builds one pair entry per left item', () => {
    const answer = buildMatchPairsAnswer({ l1: 'r2', l2: 'r4' }, leftItems);
    expect(answer).toEqual({
      pairs: [
        { left_id: 'l1', right_id: 'r2' },
        { left_id: 'l2', right_id: 'r4' },
      ],
    });
  });

  it('returns null when not fully linked', () => {
    expect(buildMatchPairsAnswer({ l1: 'r2' }, leftItems)).toBeNull();
  });
});

describe('extractExpectedPairs / isLinkExpected', () => {
  const correctAnswer = {
    pairs: [
      { left_id: 'l1', right_id: 'r2' },
      { left_id: 'l2', right_id: 'r4' },
    ],
  };

  it('reads well-formed pairs', () => {
    expect(extractExpectedPairs(correctAnswer)).toEqual(correctAnswer.pairs);
  });

  it('returns null for malformed shapes', () => {
    expect(extractExpectedPairs(null)).toBeNull();
    expect(extractExpectedPairs({})).toBeNull();
    expect(extractExpectedPairs({ pairs: 'nope' })).toBeNull();
    expect(extractExpectedPairs({ pairs: [{ left_id: 'l1' }] })).toBeNull();
  });

  it('checks membership of a submitted link in the expected set', () => {
    const pairs = extractExpectedPairs(correctAnswer)!;
    expect(isLinkExpected(pairs, 'l1', 'r2')).toBe(true);
    expect(isLinkExpected(pairs, 'l1', 'r4')).toBe(false);
  });
});
