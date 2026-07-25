import {
  buildSentenceSchemaAnswer,
  extractExpectedPlacements,
  initialPlacements,
  isFieldCorrect,
  lockedTokenIds,
  placeToken,
  poolTokenIds,
  removeToken,
  sentenceSchemaCanSubmit,
  type SentenceSchemaField,
  type SentenceSchemaToken,
} from './sentenceSchema';

const tokens: SentenceSchemaToken[] = [
  { id: 't1', text: 'at' },
  { id: 't2', text: 'han' },
  { id: 't3', text: 'ikke' },
];
const fields: SentenceSchemaField[] = [
  { id: 'subjunksjon', label: 'Subjunksjon' },
  { id: 'subjekt', label: 'Subjekt' },
  { id: 'adverbial', label: 'Adverbial' },
];

describe('initialPlacements / lockedTokenIds', () => {
  it('groups prefilled entries by field, preserving order', () => {
    const prefilled = [
      { field_id: 'subjunksjon', token_id: 't1' },
      { field_id: 'adverbial', token_id: 't3' },
    ];
    expect(initialPlacements(prefilled)).toEqual({ subjunksjon: ['t1'], adverbial: ['t3'] });
    expect(lockedTokenIds(prefilled)).toEqual(new Set(['t1', 't3']));
  });

  it('is empty with no prefilled tokens', () => {
    expect(initialPlacements(undefined)).toEqual({});
    expect(lockedTokenIds(undefined)).toEqual(new Set());
  });
});

describe('poolTokenIds', () => {
  it('lists tokens not yet placed, in content order', () => {
    expect(poolTokenIds(tokens, {})).toEqual(['t1', 't2', 't3']);
    expect(poolTokenIds(tokens, { subjunksjon: ['t1'] })).toEqual(['t2', 't3']);
  });
});

describe('placeToken', () => {
  it('appends a token to a field', () => {
    expect(placeToken({}, 'subjekt', 't2')).toEqual({ subjekt: ['t2'] });
  });

  it('appends preserving order within a field', () => {
    const p1 = placeToken({}, 'verbal', 't4');
    const p2 = placeToken(p1, 'verbal', 't5');
    expect(p2).toEqual({ verbal: ['t4', 't5'] });
  });

  it('moves a token out of its old field when re-placed elsewhere', () => {
    const placed = placeToken({ subjekt: ['t2'] }, 'adverbial', 't2');
    expect(placed).toEqual({ adverbial: ['t2'] });
  });

  it('never mutates the input', () => {
    const placements = { subjekt: ['t2'] };
    const snapshot = { subjekt: ['t2'] };
    placeToken(placements, 'adverbial', 't2');
    expect(placements).toEqual(snapshot);
  });
});

describe('removeToken', () => {
  it('removes a token from its field, returning it to the pool', () => {
    expect(removeToken({ subjekt: ['t2'] }, 't2')).toEqual({});
  });

  it('is a no-op if the token was not placed', () => {
    expect(removeToken({ subjekt: ['t2'] }, 't9')).toEqual({ subjekt: ['t2'] });
  });
});

describe('sentenceSchemaCanSubmit / buildSentenceSchemaAnswer', () => {
  it('cannot submit until every token is placed somewhere', () => {
    expect(sentenceSchemaCanSubmit({ subjunksjon: ['t1'] }, tokens)).toBe(false);
    expect(
      sentenceSchemaCanSubmit({ subjunksjon: ['t1'], subjekt: ['t2'], adverbial: ['t3'] }, tokens),
    ).toBe(true);
  });

  it('is false when there are no tokens at all', () => {
    expect(sentenceSchemaCanSubmit({}, [])).toBe(false);
  });

  it('builds one entry per field, including empty fields', () => {
    const answer = buildSentenceSchemaAnswer(
      { subjunksjon: ['t1'], subjekt: ['t2'], adverbial: ['t3'] },
      fields,
      tokens,
    );
    expect(answer).toEqual({
      placements: [
        { field_id: 'subjunksjon', token_ids: ['t1'] },
        { field_id: 'subjekt', token_ids: ['t2'] },
        { field_id: 'adverbial', token_ids: ['t3'] },
      ],
    });
  });

  it('returns null when not fully placed', () => {
    expect(buildSentenceSchemaAnswer({ subjunksjon: ['t1'] }, fields, tokens)).toBeNull();
  });
});

describe('extractExpectedPlacements / isFieldCorrect', () => {
  const correctAnswer = {
    placements: [
      { field_id: 'verbal', token_ids: ['t4', 't5'] },
      { field_id: 'sluttfelt', token_ids: ['t6', 't7'] },
    ],
  };

  it('reads well-formed placements', () => {
    expect(extractExpectedPlacements(correctAnswer)).toEqual(correctAnswer.placements);
  });

  it('returns null for malformed shapes', () => {
    expect(extractExpectedPlacements(null)).toBeNull();
    expect(extractExpectedPlacements({ placements: 'nope' })).toBeNull();
    expect(extractExpectedPlacements({ placements: [{ field_id: 'x' }] })).toBeNull();
  });

  it('is order-sensitive when checking field correctness', () => {
    const expected = extractExpectedPlacements(correctAnswer)!;
    expect(isFieldCorrect(expected, 'verbal', ['t4', 't5'])).toBe(true);
    expect(isFieldCorrect(expected, 'verbal', ['t5', 't4'])).toBe(false);
    expect(isFieldCorrect(expected, 'verbal', ['t4'])).toBe(false);
  });

  it('treats a field absent from expected as requiring an empty submission', () => {
    const expected = extractExpectedPlacements(correctAnswer)!;
    expect(isFieldCorrect(expected, 'unknown_field', [])).toBe(true);
    expect(isFieldCorrect(expected, 'unknown_field', ['t1'])).toBe(false);
  });
});
