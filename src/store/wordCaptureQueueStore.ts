import { createAsyncStorage } from '@react-native-async-storage/async-storage';
import { ApiError } from '../api/client';
import {
  captureWord,
  type CaptureWordRequest,
  type CaptureWordResponse,
} from '../api/personalVocabulary';
import { isOwnedBy, randomNonce, shouldRetry } from '../lib/reviewQueue';
import { authStore } from './authStore';

const storage = createAsyncStorage('voxord_word_capture_queue');
const STORAGE_KEY = 'queue';

interface QueuedCapture {
  id: string;
  request: CaptureWordRequest;
  queuedAt: string;
  /** Who captured it — goes out only in that learner's session (see `QueuedReview.userId`). */
  userId?: string;
}

export type CaptureOutcome =
  | { kind: 'saved'; response: CaptureWordResponse }
  | { kind: 'queued' }
  | { kind: 'refused'; error: ApiError };

/**
 * Words the student added from a text, on their way to «My words» (plan 75). Each is
 * written here first and sent at once, so a word tapped without a connection is kept and
 * goes out with the next flush rather than being lost. The server treats a word captured
 * twice as the same word, which makes a replay harmless. Words of another learner wait for
 * theirs to sign back in.
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

  /** Words of the signed-in learner still waiting for the server. */
  get pendingCount(): number {
    const userId = currentUserId();
    return this.queue.filter(entry => isOwnedBy(entry.userId, userId)).length;
  }

  async submit(request: CaptureWordRequest): Promise<CaptureOutcome> {
    await this.load();
    const userId = currentUserId();
    const entry: QueuedCapture = {
      id: randomNonce(),
      request,
      queuedAt: new Date().toISOString(),
      ...(userId ? { userId } : {}),
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
    const userId = currentUserId();

    for (const entry of [...this.queue]) {
      if (!isOwnedBy(entry.userId, userId)) continue;
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

function currentUserId(): string | null {
  return authStore.getState().user?.id ?? null;
}

export const wordCaptureQueueStore = new WordCaptureQueueStore();
