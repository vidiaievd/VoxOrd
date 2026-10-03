import {
  buildMatchPairsAnswer,
  matchPairsCanSubmit,
  readMatchPairsResults,
  toggleLink,
  type MatchPairsSlot,
} from './matchPairs';

const slots: MatchPairsSlot[] = [
  { slotId: 'p1', left: 'Kari tar imot Bartek' },
  { slotId: 'p2', left: 'Han vil bytte jobb fordi' },
];

describe('toggleLink', () => {
  it('places a half into a slot', () => {
    expect(toggleLink({}, 'p1', 'r2')).toEqual({ p1: 'r2' });
  });

  it('empties the slot when tapping the half already in it', () => {
    expect(toggleLink({ p1: 'r2' }, 'p1', 'r2')).toEqual({});
  });

  it('replaces the half in a slot with a different one', () => {
    expect(toggleLink({ p1: 'r2' }, 'p1', 'r5')).toEqual({ p1: 'r5' });
  });

  it('takes a half from another slot, leaving that slot empty', () => {
    // A half lives in at most one slot — this is what makes distractors work: with
    // eight halves for five slots, moving one must not silently duplicate it.
    expect(toggleLink({ p1: 'r2' }, 'p2', 'r2')).toEqual({ p2: 'r2' });
  });

  it('leaves unrelated slots untouched', () => {
    expect(toggleLink({ p1: 'r2', p2: 'r4' }, 'p3', 'r7')).toEqual({
      p1: 'r2',
      p2: 'r4',
      p3: 'r7',
    });
  });

  it('never mutates the input object', () => {
    const links = { p1: 'r2' };
    toggleLink(links, 'p2', 'r4');
    expect(links).toEqual({ p1: 'r2' });
  });
});

describe('matchPairsCanSubmit / buildMatchPairsAnswer', () => {
  it('can submit with a single filled slot — partial checking is legal (AC-S7)', () => {
    expect(matchPairsCanSubmit({ p1: 'r2' }, slots)).toBe(true);
    expect(matchPairsCanSubmit({ p1: 'r2', p2: 'r4' }, slots)).toBe(true);
  });

  it('cannot submit with nothing placed', () => {
    expect(matchPairsCanSubmit({}, slots)).toBe(false);
    expect(matchPairsCanSubmit({}, [])).toBe(false);
  });

  it('sends only the filled slots, as placements', () => {
    // The empty slot is absent rather than sent empty: the server scores an absent
    // slot as unanswered, and an empty one would score as wrong.
    expect(buildMatchPairsAnswer({ p2: 'r4' }, slots)).toEqual({
      placements: [{ pairId: 'p2', rightId: 'r4' }],
    });
  });

  it('keeps slot order so the verdict lines up with the screen', () => {
    expect(buildMatchPairsAnswer({ p2: 'r4', p1: 'r2' }, slots)).toEqual({
      placements: [
        { pairId: 'p1', rightId: 'r2' },
        { pairId: 'p2', rightId: 'r4' },
      ],
    });
  });

  it('returns null when nothing is placed', () => {
    expect(buildMatchPairsAnswer({}, slots)).toBeNull();
  });
});

describe('readMatchPairsResults', () => {
  it('reads the per-slot verdicts out of the submit response details', () => {
    expect(
      readMatchPairsResults({
        totalPairs: 2,
        correctPairs: 1,
        pairs: [
          { pairId: 'p1', correct: true, explanation: null },
          { pairId: 'p2', correct: false, explanation: 'Etter «fordi» star verbet etter subjektet.' },
        ],
      }),
    ).toEqual([
      { pairId: 'p1', correct: true, explanation: null },
      { pairId: 'p2', correct: false, explanation: 'Etter «fordi» star verbet etter subjektet.' },
    ]);
  });

  it('normalises a missing or empty explanation to null', () => {
    // The teacher may have written none: `FB_NO_DEFAULT` is only a blocker for the
    // `halves` variant, so a `pairs` exercise can publish without one.
    expect(readMatchPairsResults({ pairs: [{ pairId: 'p1', correct: false, explanation: '' }] }))
      .toEqual([{ pairId: 'p1', correct: false, explanation: null }]);
    expect(readMatchPairsResults({ pairs: [{ pairId: 'p1', correct: false }] })).toEqual([
      { pairId: 'p1', correct: false, explanation: null },
    ]);
  });

  it('returns null rather than throwing when details are absent or malformed', () => {
    // GRADED mode, an older server, or a template that reports nothing: the body must
    // keep rendering without per-slot colouring, not crash.
    expect(readMatchPairsResults(undefined)).toBeNull();
    expect(readMatchPairsResults(null)).toBeNull();
    expect(readMatchPairsResults({})).toBeNull();
    expect(readMatchPairsResults({ pairs: 'nope' })).toBeNull();
    expect(readMatchPairsResults({ pairs: [{ pairId: 'p1' }] })).toBeNull();
    expect(readMatchPairsResults({ pairs: [null] })).toBeNull();
  });
});
