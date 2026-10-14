import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { ApiError } from '../api/client';
import {
  captureWord,
  type CaptureWordRequest,
  type CaptureWordResponse,
} from '../api/personalVocabulary';
import { randomNonce, shouldRetry } from '../lib/reviewQueue';

const storage = createAsyncStorage('voxord_word_capture_queue');
const STORAGE_KEY = 'queue';

interface QueuedCapture {
  id: string;
  request: CaptureWordRequest;
  queuedAt: string;
}

export type CaptureOutcome =
  | { kind: 'saved'; response: CaptureWordResponse }
  | { kind: 'queued' }
  | { kind: 'refused'; error: ApiError };

/**
 * Words the student added from a text, on their way to «My words» (plan 75). Each is
 * written here first and sent at once, so a word tapped without a connection is kept and
 * goes out with the next flush rather than being lost. The server treats a word captured
 * twice as the same word, which makes a replay harmless.
 */
class WordCaptureQueueStore {
  private queue: QueuedCapture[] = [];
  private loaded = false;
  private flushing: Promise<Map<string, CaptureWordResponse>> | null = null;
  private listeners = new Set<() => void>();

  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw) this.queue = JSON.parse(raw) as QueuedCapture[];
    } catch (e) {
      console.warn('[WordCaptureQueue] Failed to load:', e);
    }
    this.loaded = true;
    this.notify();
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  async submit(request: CaptureWordRequest): Promise<CaptureOutcome> {
    await this.load();
    const entry: QueuedCapture = {
      id: randomNonce(),
      request,
      queuedAt: new Date().toISOString(),
    };

    // Sent directly first, so a refusal (an empty form, a phrase) reaches the person who
    // can fix it instead of being dropped later in a background flush.
    try {
      const response = await captureWord(request);
      // Words queued earlier go out behind this one; their order does not matter.
      this.flush().catch(() => undefined);
      return { kind: 'saved', response };
    } catch (e) {
      const error = e instanceof ApiError ? e : null;
      if (error && !shouldRetry(error.status))
        return { kind: 'refused', error };
    }

    this.queue = [...this.queue, entry];
    await this.persist();
    return { kind: 'queued' };
  }

  /** Sends everything queued. Single-flight; stops at the first word that must wait. */
  flush(): Promise<Map<string, CaptureWordResponse>> {
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush(): Promise<Map<string, CaptureWordResponse>> {
    await this.load();
    const delivered = new Map<string, CaptureWordResponse>();
    const settled: string[] = [];

    for (const entry of [...this.queue]) {
      try {
        delivered.set(entry.id, await captureWord(entry.request));
        settled.push(entry.id);
      } catch (e) {
        const status = e instanceof ApiError ? e.status : null;
        if (shouldRetry(status)) break;
        console.warn(
          `[WordCaptureQueue] Dropping «${entry.request.surfaceForm}» — refused (${status}).`,
        );
        settled.push(entry.id);
      }
    }

    if (settled.length > 0) {
      const done = new Set(settled);
      this.queue = this.queue.filter(q => !done.has(q.id));
      await this.persist();
    }
    return delivered;
  }

  private async persist(): Promise<void> {
    try {
      await storage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.warn('[WordCaptureQueue] Failed to persist:', e);
    }
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }
}

export const wordCaptureQueueStore = new WordCaptureQueueStore();
