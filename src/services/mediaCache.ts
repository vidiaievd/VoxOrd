import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { fetchMediaAsset, setLocalMediaResolver, type MediaAsset } from '../api/media';

/**
 * Course media kept on the phone for use without the network (offline plan, B3).
 *
 * Files live under the app's documents directory, one per media asset, and an index in
 * storage says which asset each is. `api/media.getMediaAsset` asks here first, so every player
 * and image already in the app plays a downloaded file with no change of its own; an asset not
 * kept is fetched from the server as before. Only course content is kept — a student's own
 * recordings never come through here.
 *
 * What is kept follows the download window: `retainOnly` drops every file the last walk of
 * the courses did not ask for, so the cache holds the units ahead and nothing behind.
 */

export interface MediaFiles {
  /** The directory the files are kept in, absolute, without a trailing slash. */
  dir(): string;
  ensureDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Downloads `url` to `path`; the size of the file written, in bytes. */
  download(url: string, path: string): Promise<number>;
  remove(path: string): Promise<void>;
}

interface IndexEntry {
  /** File name inside `dir()` — the directory is resolved at run time, not stored. */
  file: string;
  mimeType: string;
  size: number;
  savedAt: number;
}

type Index = Record<string, IndexEntry>;

export interface MediaCacheDeps {
  files: MediaFiles;
  fetchAsset(id: string): Promise<MediaAsset>;
  readIndex(): Promise<string | null>;
  writeIndex(raw: string): Promise<void>;
  now(): number;
}

const EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/** The extension players sniff the format from; the asset id keeps the name unique. */
export function fileNameFor(id: string, mimeType: string): string {
  const type = (mimeType.split(';')[0] ?? '').trim().toLowerCase();
  const ext = EXTENSIONS[type];
  return ext ? `${id}.${ext}` : id;
}

export class MediaCache {
  private index: Index | null = null;
  private loading: Promise<Index> | null = null;
  private inFlight = new Map<string, Promise<boolean>>();

  constructor(private readonly deps: MediaCacheDeps) {}

  /** The kept file of an asset as a playable asset, or null when it is not kept. */
  async lookup(id: string): Promise<MediaAsset | null> {
    const entry = (await this.load())[id];
    if (!entry) return null;
    const path = this.pathOf(entry);
    if (!(await this.deps.files.exists(path))) {
      // Removed behind our back (storage cleared by the system): forget it, fetch online.
      await this.forget([id]);
      return null;
    }
    return { id, mimeType: entry.mimeType, url: `file://${path}`, status: 'READY' };
  }

  /** Keeps an asset on the phone; true when it is kept, false when it could not be. */
  download(id: string): Promise<boolean> {
    let pending = this.inFlight.get(id);
    if (!pending) {
      pending = this.fetchOne(id).finally(() => this.inFlight.delete(id));
      this.inFlight.set(id, pending);
    }
    return pending;
  }

  /** Drops every kept file but these — what the last walk of the courses asked for. */
  async retainOnly(ids: Set<string>): Promise<void> {
    const index = await this.load();
    await this.forget(Object.keys(index).filter(id => !ids.has(id)));
  }

  async clear(): Promise<void> {
    await this.forget(Object.keys(await this.load()));
  }

  /** Bytes kept, by the index. */
  async totalBytes(): Promise<number> {
    return Object.values(await this.load()).reduce((sum, entry) => sum + entry.size, 0);
  }

  /** Bytes kept for these assets; those not kept count for nothing. */
  async bytesOf(ids: Iterable<string>): Promise<number> {
    const index = await this.load();
    let sum = 0;
    for (const id of ids) sum += index[id]?.size ?? 0;
    return sum;
  }

  private async fetchOne(id: string): Promise<boolean> {
    const index = await this.load();
    if (index[id] && (await this.deps.files.exists(this.pathOf(index[id])))) return true;

    // The signed URL lasts an hour: asked for right before the download, never stored.
    const asset = await this.deps.fetchAsset(id);
    if (asset.url.startsWith('file://')) return true;
    const file = fileNameFor(id, asset.mimeType);
    const path = `${this.deps.files.dir()}/${file}`;
    await this.deps.files.ensureDir(this.deps.files.dir());
    const size = await this.deps.files.download(asset.url, path);

    const next = { ...(await this.load()) };
    next[id] = { file, mimeType: asset.mimeType, size, savedAt: this.deps.now() };
    await this.save(next);
    return true;
  }

  private async forget(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const index = { ...(await this.load()) };
    for (const id of ids) {
      const entry = index[id];
      if (!entry) continue;
      try {
        await this.deps.files.remove(this.pathOf(entry));
      } catch {
        // Already gone is as good as removed.
      }
      delete index[id];
    }
    await this.save(index);
  }

  private pathOf(entry: IndexEntry): string {
    return `${this.deps.files.dir()}/${entry.file}`;
  }

  private load(): Promise<Index> {
    if (this.index) return Promise.resolve(this.index);
    if (!this.loading) {
      this.loading = (async () => {
        try {
          const raw = await this.deps.readIndex();
          this.index = raw ? (JSON.parse(raw) as Index) : {};
        } catch {
          this.index = {};
        }
        return this.index;
      })();
    }
    return this.loading;
  }

  private async save(index: Index): Promise<void> {
    this.index = index;
    try {
      await this.deps.writeIndex(JSON.stringify(index));
    } catch (e) {
      console.warn('[MediaCache] Failed to save the index:', e);
    }
  }
}

const indexStorage = createAsyncStorage('voxord_media_cache');

/**
 * Bytes free on the storage the media are kept on, or null when the phone will not say
 * (offline plan, B7.2). Android reports strings and iOS numbers; the app's files live on
 * internal storage.
 */
export async function freeStorageBytes(): Promise<number | null> {
  const df = await ReactNativeBlobUtil.fs.df();
  const free = Number(df.internal_free ?? df.free);
  return Number.isFinite(free) ? free : null;
}

const blobFiles: MediaFiles = {
  dir: () => `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/media`,
  ensureDir: async path => {
    if (!(await ReactNativeBlobUtil.fs.isDir(path))) await ReactNativeBlobUtil.fs.mkdir(path);
  },
  exists: path => ReactNativeBlobUtil.fs.exists(path),
  download: async (url, path) => {
    const response = await ReactNativeBlobUtil.config({ path }).fetch('GET', url);
    const status = response.info().status;
    if (status < 200 || status >= 300) {
      await ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
      throw new Error(`Media download failed with status ${status}`);
    }
    const stat = await ReactNativeBlobUtil.fs.stat(path);
    return Number(stat.size) || 0;
  },
  remove: path => ReactNativeBlobUtil.fs.unlink(path),
};

export const mediaCache = new MediaCache({
  files: blobFiles,
  fetchAsset: fetchMediaAsset,
  readIndex: () => indexStorage.getItem('index'),
  writeIndex: raw => indexStorage.setItem('index', raw),
  now: () => Date.now(),
});

// Every player in the app asks `getMediaAsset`; from here on it asks the cache first.
setLocalMediaResolver(id => mediaCache.lookup(id));
