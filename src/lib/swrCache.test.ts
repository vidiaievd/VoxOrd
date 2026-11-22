// The factory must not reference out-of-scope variables (Jest hoists
// jest.mock calls above them), so the mock fns are created inside it and
// recovered below via the mocked `createAsyncStorage` — swrCache.ts's own
// module-level `createAsyncStorage(...)` call returns this same fixed pair.
jest.mock('@react-native-async-storage/async-storage', () => {
  const getItem = jest.fn();
  const setItem = jest.fn();
  return { createAsyncStorage: () => ({ getItem, setItem }) };
});

import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import {
  getMemoryCache,
  setMemoryCache,
  readCacheSnapshot,
  readCachedAny,
  writeCacheSnapshot,
} from './swrCache';

const { getItem: mockGetItem, setItem: mockSetItem } = createAsyncStorage('unused') as unknown as {
  getItem: jest.Mock;
  setItem: jest.Mock;
};

describe('memory cache', () => {
  it('returns undefined for a key never set', () => {
    expect(getMemoryCache('never-set')).toBeUndefined();
  });

  it('round-trips a value', () => {
    setMemoryCache('course-1', { title: 'Ny i Norge' });
    expect(getMemoryCache('course-1')).toEqual({ title: 'Ny i Norge' });
  });
});

describe('readCacheSnapshot', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
  });

  it('returns null when nothing is stored', async () => {
    mockGetItem.mockResolvedValue(null);
    expect(await readCacheSnapshot('missing')).toBeNull();
  });

  it('parses a stored JSON snapshot', async () => {
    mockGetItem.mockResolvedValue(JSON.stringify({ id: 'course-1' }));
    expect(await readCacheSnapshot('course-1')).toEqual({ id: 'course-1' });
  });

  it('returns null (not throw) on malformed JSON', async () => {
    mockGetItem.mockResolvedValue('{not json');
    expect(await readCacheSnapshot('course-1')).toBeNull();
  });

  it('returns null (not throw) when storage read rejects', async () => {
    mockGetItem.mockRejectedValue(new Error('storage unavailable'));
    expect(await readCacheSnapshot('course-1')).toBeNull();
  });
});

describe('writeCacheSnapshot', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
  });

  it('serializes the value to storage', async () => {
    await writeCacheSnapshot('course-1', { id: 'course-1' });
    expect(mockSetItem).toHaveBeenCalledWith('course-1', JSON.stringify({ id: 'course-1' }));
  });

  it('does not throw when storage write rejects', async () => {
    mockSetItem.mockRejectedValue(new Error('storage full'));
    await expect(writeCacheSnapshot('course-1', {})).resolves.toBeUndefined();
  });
});

describe('readCachedAny', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
  });

  it('takes the first key that has a value, memory before snapshot', async () => {
    mockGetItem.mockImplementation(async (key: string) =>
      key === 'display:ex-1:uk' ? JSON.stringify({ lang: 'uk' }) : null,
    );
    expect(await readCachedAny(['display:ex-1:ru', 'display:ex-1:uk', 'display:ex-1:en'])).toEqual({
      lang: 'uk',
    });

    setMemoryCache('display:ex-2:en', { lang: 'en' });
    expect(await readCachedAny(['display:ex-2:ru', 'display:ex-2:en'])).toEqual({ lang: 'en' });
  });

  it('is null when no key has a value', async () => {
    mockGetItem.mockResolvedValue(null);
    expect(await readCachedAny(['a:ru', 'a:uk'])).toBeNull();
  });
});
