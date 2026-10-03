import {
  buildSortIntoBucketsSubmission,
  isMovable,
  keepOnRetry,
  placeTile,
  readSortIntoBucketsBoard,
  readSortIntoBucketsVerdict,
  tileViews,
  uncheckedCount,
  wrongCount,
  zoneNotes,
  type SortIntoBucketsVerdict,
} from './sortIntoBuckets';

/** A projection as content-service sends it: no bucket on a tile, no rule on a zone, no `fb`. */
const projection = {
  instruction: 'Sorter ordene etter kjønn.',
  buckets: [
    { id: 'en', label: 'en', hint: 'Hankjønn' },
    { id: 'ei', label: 'ei' },
    { id: 'et', label: 'et' },
  ],
  items: [
    { id: 't1', text: 'bil' },
    { id: 't2', text: 'bok', mediaId: 'm-bok' },
    { id: 't3', text: 'hus' },
  ],
  settings: {
    showRemaining: true,
    revealKey: true,
    attempts: 2,
    threshold: 80,
  },
};

/** A first check: `bil` right and frozen, `bok` in `et` and wrong, `hus` left in the pool. */
const firstCheck = {
  totalItems: 3,
  passedItems: 1,
  correctNow: 1,
  attempt: 1,
  checksLeft: 1,
  closed: false,
  revealed: false,
  locked: ['t1'],
  rules: [],
  items: [
    {
      itemId: 't1',
      chosenBucketId: 'en',
      correct: true,
      firstCorrect: true,
      firstAnswer: 'en',
    },
    {
      itemId: 't2',
      chosenBucketId: 'et',
      correct: false,
      firstCorrect: false,
      firstAnswer: 'et',
      explanation: 'Bok er ikke intetkjønn.',
    },
    {
      itemId: 't3',
      chosenBucketId: null,
      correct: false,
      firstCorrect: false,
      firstAnswer: null,
    },
  ],
};

function verdict(raw: unknown = firstCheck): SortIntoBucketsVerdict {
  const read = readSortIntoBucketsVerdict(raw);
  if (read === null) throw new Error('fixture verdict did not read');
  return read;
}

describe('readSortIntoBucketsBoard', () => {
  it('reads the projection field by field', () => {
    const board = readSortIntoBucketsBoard(projection);
    expect(board).not.toBeNull();
    expect(board?.buckets).toEqual([
      { id: 'en', label: 'en', hint: 'Hankjønn' },
      { id: 'ei', label: 'ei' },
      { id: 'et', label: 'et' },
    ]);
    expect(board?.tiles).toEqual([
      { id: 't1', text: 'bil' },
      { id: 't2', text: 'bok', mediaId: 'm-bok' },
      { id: 't3', text: 'hus' },
    ]);
    expect(board?.settings).toEqual({
      showRemaining: true,
      revealKey: true,
      attempts: 2,
      threshold: 80,
    });
  });

  // AC-S11 on the device: a board carrying any part of the key is refused, not stripped.
  it.each([
    [
      'a tile with its bucket',
      { items: [{ id: 't1', text: 'bil', bucketId: 'en' }] },
    ],
    [
      'a tile with its other zones',
      { items: [{ id: 't1', text: 'bil', also: [] }] },
    ],
    [
      'a tile with its reason',
      { items: [{ id: 't1', text: 'bil', why: 'x' }] },
    ],
    [
      'a zone with its rule',
      {
        buckets: [
          { id: 'en', label: 'en', rule: 'x' },
          { id: 'ei', label: 'ei' },
        ],
      },
    ],
    ['the explanations map', { fb: {} }],
  ])('refuses %s', (_name, patch) => {
    expect(readSortIntoBucketsBoard({ ...projection, ...patch })).toBeNull();
  });

  it('refuses a board nobody could answer', () => {
    expect(
      readSortIntoBucketsBoard({
        ...projection,
        buckets: [{ id: 'en', label: 'en' }],
      }),
    ).toBeNull();
    expect(
      readSortIntoBucketsBoard({
        ...projection,
        items: [{ id: 't1', text: '  ' }],
      }),
    ).toBeNull();
    expect(readSortIntoBucketsBoard(null)).toBeNull();
    expect(readSortIntoBucketsBoard({ rows: [] })).toBeNull();
  });

  it('reads missing or odd settings as the author defaults', () => {
    const board = readSortIntoBucketsBoard({
      ...projection,
      settings: { attempts: 7 },
    });
    expect(board?.settings).toEqual({
      showRemaining: false,
      revealKey: true,
      attempts: 0,
      threshold: 70,
    });
  });
});

describe('readSortIntoBucketsVerdict', () => {
  it('reads a check and copies optional fields only when they came', () => {
    const read = verdict();
    expect(read.locked).toEqual(['t1']);
    expect(read.checksLeft).toBe(1);
    expect(read.items[1]).toEqual({
      itemId: 't2',
      chosenBucketId: 'et',
      correct: false,
      firstCorrect: false,
      firstAnswer: 'et',
      explanation: 'Bok er ikke intetkjønn.',
    });
    expect(read.items[1]).not.toHaveProperty('correctBucketId');
    expect(read.items[2].chosenBucketId).toBeNull();
  });

  it('reads `checksLeft: null` as no limit', () => {
    expect(verdict({ ...firstCheck, checksLeft: null }).checksLeft).toBeNull();
  });

  it('refuses a verdict that does not say whether the board is closed', () => {
    expect(
      readSortIntoBucketsVerdict({ ...firstCheck, closed: undefined }),
    ).toBeNull();
    expect(
      readSortIntoBucketsVerdict({ ...firstCheck, items: [{ itemId: 't1' }] }),
    ).toBeNull();
    expect(readSortIntoBucketsVerdict(undefined)).toBeNull();
  });
});

describe('buildSortIntoBucketsSubmission', () => {
  it('sends every placement and nothing about the attempt', () => {
    expect(buildSortIntoBucketsSubmission({ t1: 'en', t2: 'et' })).toEqual({
      placements: [
        { itemId: 't1', bucketId: 'en' },
        { itemId: 't2', bucketId: 'et' },
      ],
    });
  });

  it('marks the reveal only when it is one', () => {
    expect(buildSortIntoBucketsSubmission({}, true)).toEqual({
      placements: [],
      reveal: true,
    });
  });
});

describe('placeTile', () => {
  it('puts a tile in a zone, moves it, and takes it back', () => {
    const one = placeTile({}, [], 't2', 'ei');
    expect(one).toEqual({ t2: 'ei' });
    expect(placeTile(one, [], 't2', 'et')).toEqual({ t2: 'et' });
    expect(placeTile(one, [], 't2', null)).toEqual({});
  });

  it('leaves a frozen tile where it is', () => {
    const placements = { t1: 'en' };
    expect(placeTile(placements, ['t1'], 't1', 'ei')).toBe(placements);
    expect(placeTile(placements, ['t1'], 't1', null)).toBe(placements);
  });
});

describe('tileViews', () => {
  const board = readSortIntoBucketsBoard(projection)!;

  it('before a check: pool and placed only — nothing here knows a right zone', () => {
    const views = tileViews(board.tiles, { t1: 'en' }, null, []);
    expect(views.map(v => [v.tile.id, v.state, v.zone])).toEqual([
      ['t1', 'placed', 'en'],
      ['t2', 'pool', null],
      ['t3', 'pool', null],
    ]);
    expect(uncheckedCount(views)).toBe(1);
    expect(wrongCount(views)).toBe(0);
  });

  it('after a check: frozen, wrong, and a tile moved since the check is unchecked again', () => {
    const v = verdict();
    const checked = tileViews(board.tiles, { t1: 'en', t2: 'et' }, v, v.locked);
    expect(checked.map(x => x.state)).toEqual(['ok', 'bad', 'pool']);
    expect(wrongCount(checked)).toBe(1);
    expect(uncheckedCount(checked)).toBe(0);

    const moved = tileViews(board.tiles, { t1: 'en', t2: 'ei' }, v, v.locked);
    expect(moved[1].state).toBe('placed');
  });

  it('a closed board with the key draws a wrong tile in the zone it belongs to', () => {
    const closed = verdict({
      ...firstCheck,
      closed: true,
      items: firstCheck.items.map(item =>
        item.itemId === 't2'
          ? { ...item, correctBucketId: 'ei', why: 'Bok er hunkjønn.' }
          : item,
      ),
    });
    const views = tileViews(
      board.tiles,
      { t1: 'en', t2: 'et' },
      closed,
      closed.locked,
    );
    expect(views[1]).toMatchObject({ state: 'key', zone: 'ei' });
    expect(isMovable(views[1].state)).toBe(false);
  });

  it('keeps the freeze when the verdict is gone (a retry)', () => {
    const views = tileViews(board.tiles, { t1: 'en' }, null, ['t1']);
    expect(views[0].state).toBe('ok');
    expect(isMovable(views[0].state)).toBe(false);
  });
});

describe('zoneNotes', () => {
  const board = readSortIntoBucketsBoard(projection)!;

  it('says why a wrong tile is wrong, under the zone it was put in', () => {
    const v = verdict();
    const views = tileViews(board.tiles, { t1: 'en', t2: 'et' }, v, v.locked);
    expect(zoneNotes(views, 'et', v)).toEqual([
      { id: 't2', text: 'bok', body: 'Bok er ikke intetkjønn.' },
    ]);
    expect(zoneNotes(views, 'en', v)).toEqual([]);
    expect(zoneNotes(views, 'et', null)).toEqual([]);
  });
});

describe('keepOnRetry', () => {
  it('sends back exactly the tiles found wrong (AC-S5)', () => {
    const v = verdict();
    expect(keepOnRetry({ t1: 'en', t2: 'et' }, v, v.locked)).toEqual({
      t1: 'en',
    });
  });

  it('keeps a tile moved since the check — it was never judged where it is now', () => {
    const v = verdict();
    expect(keepOnRetry({ t1: 'en', t2: 'ei', t3: 'et' }, v, v.locked)).toEqual({
      t1: 'en',
      t2: 'ei',
      t3: 'et',
    });
  });
});
