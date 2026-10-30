import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import type { MistakeOverlayEntry } from '../lib/mistakes';

const storage = createAsyncStorage('voxord_mistake_overlay');
const STORAGE_KEY = 'entries';

const keyOf = (entry: MistakeOverlayEntry) => `${entry.userId}|${entry.exerciseId}|${entry.at}`;

/** A learner answering a hundred exercises offline is far past what the section shows. */
const MAX_ENTRIES = 200;

/**
 * The runner's verdicts the server may not have yet (plan 05, step 8), laid over its list of
 * mistakes by `lib/mistakes.ts`. Kept on the device so an answer given offline still shows
 * after a restart; an entry goes once the server is known to have it (`settle`).
 */
class MistakeOverlayStore {
  private entries: MistakeOverlayEntry[] = [];
  private loaded: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  load(): Promise<void> {
    this.loaded ??= storage
      .getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) this.entries = JSON.parse(raw) as MistakeOverlayEntry[];
      })
      .catch(e => console.warn('[MistakeOverlay] Failed to load:', e))
      .then(() => this.notify());
    return this.loaded;
  }

  list(userId: string): MistakeOverlayEntry[] {
    return this.entries.filter(entry => entry.userId === userId);
  }

  async record(entry: MistakeOverlayEntry): Promise<void> {
    await this.load();
    this.entries = [...this.entries, entry].slice(-MAX_ENTRIES);
    await this.persist();
  }

  /** Drops the given entries — the server has them. */
  async settle(settled: readonly MistakeOverlayEntry[]): Promise<void> {
    if (settled.length === 0) return;
    const gone = new Set(settled.map(keyOf));
    this.entries = this.entries.filter(entry => !gone.has(keyOf(entry)));
    await this.persist();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async persist(): Promise<void> {
    this.notify();
    try {
      await storage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch (e) {
      console.warn('[MistakeOverlay] Failed to persist:', e);
    }
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }
}

export const mistakeOverlayStore = new MistakeOverlayStore();
