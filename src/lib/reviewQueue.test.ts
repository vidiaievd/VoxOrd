import {
  enqueueReview,
  makeIdempotencyKey,
  randomNonce,
  removeReviews,
  shouldRetry,
  type QueuedReview,
} from './reviewQueue';

function makeReview(overrides: Partial<QueuedReview> = {}): QueuedReview {
  return {
    cardId: 'card-1',
    rating: 'GOOD',
    reviewedAt: '2026-07-27T10:00:00.000Z',
    idempotencyKey: 'key-1',
    ...overrides,
  };
}

describe('enqueueReview', () => {
  it('appends in answer order', () => {
    const first = makeReview({ idempotencyKey: 'key-1' });
    const second = makeReview({ idempotencyKey: 'key-2', rating: 'AGAIN' });

    const queue = enqueueReview(enqueueReview([], first), second);

    expect(queue.map((r) => r.idempotencyKey)).toEqual(['key-1', 'key-2']);
  });

  it('keeps both answers when the same card is reviewed twice', () => {
    const queue = enqueueReview(
      enqueueReview([], makeReview({ idempotencyKey: 'key-1', rating: 'AGAIN' })),
      makeReview({ idempotencyKey: 'key-2', rating: 'GOOD' }),
    );

    expect(queue).toHaveLength(2);
    expect(queue.every((r) => r.cardId === 'card-1')).toBe(true);
  });

  it('drops the oldest entries once the cap is exceeded', () => {
    let queue: QueuedReview[] = [];
    for (let i = 0; i < 5; i++) {
      queue = enqueueReview(queue, makeReview({ idempotencyKey: `key-${i}` }), 3);
    }

    expect(queue.map((r) => r.idempotencyKey)).toEqual(['key-2', 'key-3', 'key-4']);
  });
});

describe('removeReviews', () => {
  it('removes only the given keys', () => {
    const queue = [
      makeReview({ idempotencyKey: 'key-1' }),
      makeReview({ idempotencyKey: 'key-2' }),
      makeReview({ idempotencyKey: 'key-3' }),
    ];

    expect(removeReviews(queue, ['key-2']).map((r) => r.idempotencyKey)).toEqual([
      'key-1',
      'key-3',
    ]);
  });

  it('returns the queue untouched for an empty key list', () => {
    const queue = [makeReview()];
    expect(removeReviews(queue, [])).toBe(queue);
  });
});

describe('shouldRetry', () => {
  it('retries network failures (no status)', () => {
    expect(shouldRetry(null)).toBe(true);
  });

  it('retries 401 (the user may sign back in) and 429 (cap resets)', () => {
    expect(shouldRetry(401)).toBe(true);
    expect(shouldRetry(429)).toBe(true);
  });

  it('retries server errors', () => {
    expect(shouldRetry(500)).toBe(true);
    expect(shouldRetry(503)).toBe(true);
  });

  it('drops answers the server can never accept', () => {
    expect(shouldRetry(404)).toBe(false); // card deleted
    expect(shouldRetry(403)).toBe(false); // another user's card
    expect(shouldRetry(422)).toBe(false); // card suspended
    expect(shouldRetry(400)).toBe(false);
  });
});

describe('makeIdempotencyKey', () => {
  it('combines card, timestamp and nonce', () => {
    expect(makeIdempotencyKey('card-1', '2026-07-27T10:00:00.000Z', 'abc123')).toBe(
      'card-1:2026-07-27T10:00:00.000Z:abc123',
    );
  });

  it('differs for two answers to the same card at the same instant', () => {
    const at = '2026-07-27T10:00:00.000Z';
    expect(makeIdempotencyKey('card-1', at, 'aaa')).not.toBe(
      makeIdempotencyKey('card-1', at, 'bbb'),
    );
  });

  it('stays within the server’s 128-character limit', () => {
    const key = makeIdempotencyKey(
      '11111111-1111-4111-8111-111111111111',
      '2026-07-27T10:00:00.000Z',
      randomNonce(),
    );
    expect(key.length).toBeLessThanOrEqual(128);
  });
});
