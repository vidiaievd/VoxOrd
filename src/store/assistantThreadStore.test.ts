/** In-memory stand-in for the device's async storage. */
const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: () => ({
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    getAllKeys: async () => [...mockStorage.keys()],
    removeMany: async (keys: string[]) => keys.forEach((k) => mockStorage.delete(k)),
    clear: async () => mockStorage.clear(),
  }),
}));

import { authStore } from './authStore';
import {
  assistantThreadStore,
  capThreads,
  THREADS_KEPT,
  TURNS_KEPT,
  type ThreadTurn,
} from './assistantThreadStore';

const LEARNER = { id: 'user-1', email: 'a@b.c', roles: ['student'] };
const OTHER = { id: 'user-2', email: 'x@y.z', roles: ['student'] };

const turn = (i: number, role: 'user' | 'assistant' = 'user'): ThreadTurn => ({
  id: `t${i}`,
  role,
  text: `turn ${i}`,
  at: new Date(2026, 9, 25, 10, 0, i).toISOString(),
});

/** Lets the store's queued writes land. */
const settle = () => assistantThreadStore.getThread('settle');

beforeAll(() => assistantThreadStore.start());

beforeEach(async () => {
  authStore.setSignedIn(LEARNER);
  await settle();
  mockStorage.clear();
});

describe('assistantThreadStore', () => {
  it('keeps one thread per context', async () => {
    await assistantThreadStore.append('unit:a', [turn(1), turn(2, 'assistant')]);
    await assistantThreadStore.append('free', [turn(3)]);
    expect((await assistantThreadStore.getThread('unit:a')).map((t) => t.id)).toEqual(['t1', 't2']);
    expect((await assistantThreadStore.getThread('free')).map((t) => t.id)).toEqual(['t3']);
  });

  it(`keeps the newest ${TURNS_KEPT} turns of a thread`, async () => {
    for (let i = 0; i < TURNS_KEPT + 5; i++) await assistantThreadStore.append('unit:a', [turn(i)]);
    const thread = await assistantThreadStore.getThread('unit:a');
    expect(thread).toHaveLength(TURNS_KEPT);
    expect(thread[0].id).toBe('t5');
    expect(thread[TURNS_KEPT - 1].id).toBe(`t${TURNS_KEPT + 4}`);
  });

  it('two quick appends both land', async () => {
    await Promise.all([
      assistantThreadStore.append('unit:a', [turn(1)]),
      assistantThreadStore.append('unit:a', [turn(2, 'assistant')]),
    ]);
    expect(await assistantThreadStore.getThread('unit:a')).toHaveLength(2);
  });

  it('marks feedback on one turn', async () => {
    await assistantThreadStore.append('unit:a', [turn(1), turn(2, 'assistant')]);
    await assistantThreadStore.setFeedback('unit:a', 't2', false);
    const thread = await assistantThreadStore.getThread('unit:a');
    expect(thread[1].feedback).toBe('not_helpful');
    expect(thread[0].feedback).toBeUndefined();
  });

  it('is gone at sign-out', async () => {
    await assistantThreadStore.append('unit:a', [turn(1)]);
    authStore.setSignedOut();
    await settle();
    expect(mockStorage.size).toBe(0);
    authStore.setSignedIn(LEARNER);
    expect(await assistantThreadStore.getThread('unit:a')).toEqual([]);
  });

  it("never shows one learner another's thread", async () => {
    await assistantThreadStore.append('unit:a', [turn(1)]);
    // A session that ended without the app seeing the sign-out: the next learner signs in.
    authStore.setSignedIn(OTHER);
    expect(await assistantThreadStore.getThread('unit:a')).toEqual([]);
    expect(mockStorage.has(LEARNER.id)).toBe(false);
  });

  it('keeps nothing while nobody is signed in', async () => {
    authStore.setSignedOut();
    await assistantThreadStore.append('unit:a', [turn(1)]);
    expect(await assistantThreadStore.getThread('unit:a')).toEqual([]);
    expect(mockStorage.size).toBe(0);
  });

  it('a locked session keeps its threads', async () => {
    await assistantThreadStore.append('unit:a', [turn(1)]);
    authStore.setLocked();
    await settle();
    authStore.setSignedIn(LEARNER);
    expect(await assistantThreadStore.getThread('unit:a')).toHaveLength(1);
  });

  it('a thread that does not read is an empty one', async () => {
    mockStorage.set(LEARNER.id, '{not json');
    expect(await assistantThreadStore.getThread('unit:a')).toEqual([]);
  });
});

describe('capThreads', () => {
  it(`keeps the ${THREADS_KEPT} most recently used threads`, () => {
    const threads = Object.fromEntries(
      Array.from({ length: THREADS_KEPT + 3 }, (_, i) => [
        `ctx${i}`,
        { updatedAt: new Date(2026, 9, 1 + i).toISOString(), turns: [turn(i)] },
      ]),
    );
    const kept = Object.keys(capThreads(threads));
    expect(kept).toHaveLength(THREADS_KEPT);
    expect(kept).not.toContain('ctx0');
    expect(kept).toContain(`ctx${THREADS_KEPT + 2}`);
  });
});
