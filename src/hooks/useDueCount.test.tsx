import React from 'react';
import renderer, { act } from 'react-test-renderer';

let mockSwr: {
  status: 'loading' | 'loaded' | 'error';
  data: { dueNowCount: number } | null;
  error: Error | null;
  stale: boolean;
};
const mockRefresh = jest.fn(async () => {});
const mockSwrKeys: (string | null)[] = [];
jest.mock('./useSwrResource', () => ({
  useSwrResource: (key: string | null) => {
    mockSwrKeys.push(key);
    return { ...mockSwr, refreshing: false, refresh: mockRefresh };
  },
}));

let mockAuth = 'signedIn';
jest.mock('./useAuth', () => ({ useAuth: () => ({ status: mockAuth }) }));

const mockReplicaCount = jest.fn<Promise<number | null>, []>();
jest.mock('../services/vocabularyReplica', () => ({
  shouldUseReplica: (e: Error) => e.message === 'out of reach',
  vocabularyReplica: { dueCount: () => mockReplicaCount() },
}));

jest.mock('../api/srs', () => ({ getSrsStats: jest.fn() }));

import {
  DUE_COUNT_MAX_AGE_MS,
  useDueCount,
  type DueCount,
} from './useDueCount';

let seen: DueCount;
function Probe({ focus }: { focus?: string }) {
  seen = useDueCount(focus);
  return null;
}

async function render(focus?: string) {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Probe focus={focus} />);
  });
  return tree;
}

beforeEach(() => {
  mockSwr = {
    status: 'loaded',
    data: { dueNowCount: 18 },
    error: null,
    stale: false,
  };
  mockAuth = 'signedIn';
  mockSwrKeys.length = 0;
  mockRefresh.mockClear();
  mockReplicaCount.mockReset();
});

describe('useDueCount', () => {
  it('online: the server count, under the key Today reads', async () => {
    await render();
    expect(seen).toEqual({ count: 18, fromReplica: false, status: 'loaded' });
    expect(mockSwrKeys).toContain('srs-stats');
    expect(mockReplicaCount).not.toHaveBeenCalled();
  });

  it('offline with a copy: the copy count, even over a stale cached one', async () => {
    mockSwr = {
      status: 'loaded',
      data: { dueNowCount: 18 },
      error: new Error('out of reach'),
      stale: true,
    };
    mockReplicaCount.mockResolvedValue(11);
    await render();
    expect(seen).toEqual({ count: 11, fromReplica: true, status: 'loaded' });
  });

  it('offline without a copy: unknown, so no badge', async () => {
    mockSwr = {
      status: 'error',
      data: null,
      error: new Error('out of reach'),
      stale: false,
    };
    mockReplicaCount.mockResolvedValue(null);
    await render();
    expect(seen).toEqual({
      count: null,
      fromReplica: false,
      status: 'unavailable',
    });
  });

  it('a refusal from the server is not offline: no copy, no count', async () => {
    mockSwr = {
      status: 'error',
      data: null,
      error: new Error('403'),
      stale: false,
    };
    await render();
    expect(seen).toEqual({
      count: null,
      fromReplica: false,
      status: 'unavailable',
    });
    expect(mockReplicaCount).not.toHaveBeenCalled();
  });

  it('signed out: asks nobody', async () => {
    mockAuth = 'signedOut';
    mockSwr = { status: 'loading', data: null, error: null, stale: false };
    await render();
    expect(mockSwrKeys.every(k => k === null)).toBe(true);
    expect(seen.count).toBeNull();
  });

  it('fetches again on arrival only when the count is over a minute old', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const tree = await render('Today');
    expect(mockRefresh).not.toHaveBeenCalled();

    now.mockReturnValue(1_000_000 + 10_000);
    await act(async () => tree.update(<Probe focus="Practice" />));
    expect(mockRefresh).not.toHaveBeenCalled();

    now.mockReturnValue(1_000_000 + DUE_COUNT_MAX_AGE_MS + 1);
    await act(async () => tree.update(<Probe focus="Courses" />));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });
});
