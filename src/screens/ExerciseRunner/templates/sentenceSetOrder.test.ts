import { deferPosition, nextPosition, type SetPosition } from './sentenceSetOrder';

const position = (over: Partial<SetPosition> = {}): SetPosition => ({
  ids: ['r1', 'r2', 'r3'],
  index: 0,
  isClosed: () => false,
  deferred: [],
  ...over,
});

describe('nextPosition', () => {
  it('walks forward while there is an open sentence ahead', () => {
    expect(nextPosition(position())).toEqual({ index: 1, deferred: [] });
  });

  it('skips sentences already closed', () => {
    const step = nextPosition(position({ isClosed: (id) => id === 'r2' }));
    expect(step.index).toBe(2);
  });

  it('ends the set when nothing is left', () => {
    expect(nextPosition(position({ index: 2 }))).toEqual({ index: null, deferred: [] });
  });

  it('comes back to what was put aside, oldest first, dropping it from the queue', () => {
    const step = nextPosition(position({ index: 2, deferred: ['r1'] }));
    expect(step).toEqual({ index: 0, deferred: [] });
  });

  it('does not offer a deferred sentence again on the way forward', () => {
    // r2 is owed a second look later; the walk must pass over it now, not land on it.
    const step = nextPosition(position({ index: 0, deferred: ['r2'] }));
    expect(step.index).toBe(2);
  });

  it('drops a queued sentence the set no longer has', () => {
    const step = nextPosition(position({ index: 2, deferred: ['gone', 'r1'] }));
    expect(step).toEqual({ index: 0, deferred: [] });
  });
});

describe('deferPosition', () => {
  it('sends the sentence to the back and moves on', () => {
    const step = deferPosition(position(), []);
    expect(step).toEqual({ index: 1, deferred: ['r1'] });
  });

  it('offers it again after the last sentence', () => {
    const first = deferPosition(position(), []);
    const then = nextPosition(position({ index: 2, deferred: first.deferred }));
    expect(then).toEqual({ index: 0, deferred: [] });
  });

  it('refuses a second time: the sentence is not queued again, and the set can end', () => {
    // The memory is read as it stood before this refusal — a sentence that told
    // `deferPosition` it had been round once would have its first skip treated as its
    // second and queue nothing.
    const step = deferPosition(position({ index: 2 }), ['r3']);
    expect(step).toEqual({ index: null, deferred: [] });
  });

  it('ends the set when the current sentence is not in it', () => {
    expect(deferPosition(position({ index: 9 }), [])).toEqual({ index: null, deferred: [] });
  });
});
