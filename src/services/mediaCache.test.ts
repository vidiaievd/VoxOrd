jest.mock('react-native-blob-util', () => ({ fs: { dirs: { DocumentDir: '/docs' } } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: () => ({ getItem: async () => null, setItem: async () => undefined }),
}));

import { getMediaAsset, setLocalMediaResolver } from '../api/media';
import { apiClient } from '../api/client';
import { fileNameFor, MediaCache, type MediaCacheDeps } from './mediaCache';

function makeCache(overrides: Partial<MediaCacheDeps> = {}) {
  const disk = new Map<string, number>();
  let index: string | null = null;
  const fetchAsset = jest.fn(async (id: string) => ({
    id,
    mimeType: 'audio/mpeg',
    url: `https://minio/${id}?sig`,
  }));
  const deps: MediaCacheDeps = {
    files: {
      dir: () => '/docs/media',
      ensureDir: async () => undefined,
      exists: async path => disk.has(path),
      download: async (_url, path) => {
        disk.set(path, 1234);
        return 1234;
      },
      remove: async path => {
        disk.delete(path);
      },
    },
    fetchAsset,
    readIndex: async () => index,
    writeIndex: async raw => {
      index = raw;
    },
    now: () => 1,
    ...overrides,
  };
  return { cache: new MediaCache(deps), disk, fetchAsset, deps };
}

describe('MediaCache', () => {
  it('keeps a file under a name players can sniff and serves it as file://', async () => {
    const { cache, disk } = makeCache();

    expect(await cache.download('a1')).toBe(true);

    expect(disk.has('/docs/media/a1.mp3')).toBe(true);
    expect(await cache.lookup('a1')).toEqual({
      id: 'a1',
      mimeType: 'audio/mpeg',
      url: 'file:///docs/media/a1.mp3',
      status: 'READY',
    });
    expect(await cache.totalBytes()).toBe(1234);
  });

  it('downloads a file once, however often it is asked for', async () => {
    const { cache, fetchAsset } = makeCache();
    await Promise.all([cache.download('a1'), cache.download('a1')]);
    await cache.download('a1');
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it('forgets a file the system removed and lets the server answer', async () => {
    const { cache, disk } = makeCache();
    await cache.download('a1');
    disk.clear();

    expect(await cache.lookup('a1')).toBeNull();
    expect(await cache.totalBytes()).toBe(0);
  });

  it('keeps only what the last walk asked for', async () => {
    const { cache, disk } = makeCache();
    await cache.download('a1');
    await cache.download('a2');

    await cache.retainOnly(new Set(['a2']));

    expect(disk.has('/docs/media/a1.mp3')).toBe(false);
    expect(await cache.lookup('a1')).toBeNull();
    expect(await cache.lookup('a2')).not.toBeNull();
  });

  it('clears everything', async () => {
    const { cache, disk } = makeCache();
    await cache.download('a1');
    await cache.clear();
    expect(disk.size).toBe(0);
  });

  it('reads the index a previous run of the app left', async () => {
    const first = makeCache();
    await first.cache.download('a1');
    const raw = await first.deps.readIndex();

    const second = makeCache({ readIndex: async () => raw, files: first.deps.files });
    expect(await second.cache.lookup('a1')).not.toBeNull();
  });
});

describe('fileNameFor', () => {
  it('names a file by its asset and its type', () => {
    expect(fileNameFor('x', 'audio/mp4; codecs=mp4a')).toBe('x.m4a');
    expect(fileNameFor('x', 'image/jpeg')).toBe('x.jpg');
    expect(fileNameFor('x', 'application/octet-stream')).toBe('x');
  });
});

describe('getMediaAsset', () => {
  afterEach(() => setLocalMediaResolver(null));

  it('plays the kept copy and does not ask the server', async () => {
    const get = jest.spyOn(apiClient, 'get');
    setLocalMediaResolver(async id => ({ id, mimeType: 'audio/mpeg', url: 'file:///docs/media/x.mp3' }));

    expect((await getMediaAsset('x')).url).toBe('file:///docs/media/x.mp3');
    expect(get).not.toHaveBeenCalled();
    get.mockRestore();
  });

  it('asks the server for what is not kept, or when the cache fails', async () => {
    const get = jest.spyOn(apiClient, 'get').mockResolvedValue({ id: 'x', url: 'https://s/x' });
    setLocalMediaResolver(async () => null);
    expect((await getMediaAsset('x')).url).toBe('https://s/x');

    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    setLocalMediaResolver(async () => {
      throw new Error('disk');
    });
    expect((await getMediaAsset('x')).url).toBe('https://s/x');
    get.mockRestore();
  });
});
