import React from 'react';
import renderer, { act } from 'react-test-renderer';

/**
 * A pull-to-refresh that fails keeps the screen it was pulled on (OQ-S3 П-2 live check:
 * offline, pulling a saved course page turned it into "Network request failed").
 */

const mockMemory = new Map<string, unknown>();
jest.mock('../lib/swrCache', () => ({
  getMemoryCache: (key: string) => mockMemory.get(key),
  setMemoryCache: (key: string, data: unknown) => {
    mockMemory.set(key, data);
  },
  readCacheSnapshot: async () => null,
  writeCacheSnapshot: async () => {},
  readCachedAny: async () => null,
}));

import { useSwrResource, type SwrResourceState } from './useSwrResource';

const loader = jest.fn<Promise<{ title: string }>, []>();
let seen: SwrResourceState<{ title: string }>;

function Probe() {
  seen = useSwrResource('course:1', loader);
  return null;
}

async function render() {
  await act(async () => {
    renderer.create(<Probe />);
  });
}

beforeEach(() => {
  mockMemory.clear();
  loader.mockReset();
});

describe('useSwrResource refresh', () => {
  it('a failed refresh keeps the data on screen, marked stale, with the error', async () => {
    loader.mockResolvedValueOnce({ title: 'Norsk B1' });
    await render();
    expect(seen.status).toBe('loaded');

    loader.mockRejectedValueOnce(new Error('Network request failed'));
    await act(async () => {
      await seen.refresh();
    });

    expect(seen.status).toBe('loaded');
    expect(seen.data).toEqual({ title: 'Norsk B1' });
    expect(seen.stale).toBe(true);
    expect(seen.error?.message).toBe('Network request failed');
    expect(seen.refreshing).toBe(false);
  });

  it('a failed refresh from the error state stays an error', async () => {
    loader.mockRejectedValueOnce(new Error('Network request failed'));
    await render();
    expect(seen.status).toBe('error');

    loader.mockRejectedValueOnce(new Error('Network request failed'));
    await act(async () => {
      await seen.refresh();
    });
    expect(seen.status).toBe('error');
    expect(seen.data).toBeNull();
  });

  it('a successful refresh replaces the data and clears stale', async () => {
    loader.mockResolvedValueOnce({ title: 'old' });
    await render();
    loader.mockResolvedValueOnce({ title: 'new' });
    await act(async () => {
      await seen.refresh();
    });
    expect(seen.data).toEqual({ title: 'new' });
    expect(seen.stale).toBe(false);
  });
});
