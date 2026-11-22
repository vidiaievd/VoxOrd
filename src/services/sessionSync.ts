import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { authService } from '../api/auth';
import { authStore, type AuthState } from '../store/authStore';
import { reviewQueueStore } from '../store/reviewQueueStore';
import { wordCaptureQueueStore } from '../store/wordCaptureQueueStore';
import { exerciseOutboxStore } from '../store/exerciseOutboxStore';
import { notificationsStore } from '../store/notificationsStore';
import { accountPrefsStore } from '../store/accountPrefsStore';
import { vocabularyReplica } from './vocabularyReplica';
import { courseDownloader } from './courseDownload';

/**
 * What the coordinator needs from the outside world — the device, the session and the
 * queues. Injected so the sequence can be tested without native modules.
 */
export interface SessionSyncDeps {
  /** Calls back with whether the device has a network; returns an unsubscribe. */
  onNetworkChange(listener: (connected: boolean) => void): () => void;
  /** Calls back each time the app comes to the foreground; returns an unsubscribe. */
  onForeground(listener: () => void): () => void;
  getAuth(): AuthState;
  onAuthChange(listener: () => void): () => void;
  reconnect(): Promise<void>;
  /**
   * What runs once the session is online, in order: everything answered or captured
   * offline goes out, then the copies kept for offline are taken afresh.
   */
  queues: ReadonlyArray<{ name: string; flush(): Promise<unknown> }>;
  /**
   * True while something sits in a queue that only time can release — an answer a suspended
   * school refused. No network or foreground event announces that the school came back, so
   * the sync tries again by itself.
   */
  hasWaiting?(): boolean;
  /**
   * True while a queue still holds an answer it kept for a reason a later try can clear — the
   * network, a 401 / 429 / 5xx. The session can be online and the send still fail: NetInfo and
   * a refresh that got through say nothing about the network the next request takes (plan 90,
   * live check s20: mobile data up first, without a route to the server).
   */
  hasUndelivered?(): boolean;
  /** Pause before such a retry, in ms (default 30 s). */
  retryDelayMs?: number;
}

const DEFAULT_RETRY_DELAY_MS = 30_000;

/**
 * Brings a session that worked offline back to the server (offline plan, B0.5.2).
 *
 * - The network comes up, or the app comes back to the foreground → the session reconnects:
 *   the refresh token is exchanged and the offline flag cleared. NetInfo only says there is a
 *   network, not that the server is on it; the refresh is what finds out.
 * - The session becomes online — after a reconnect, a cold start the server confirmed, or a
 *   sign-in → the queues are sent, oldest kind first. Reviews go before captured words: a
 *   review can only be about a card that already exists, a word only adds one. Then the
 *   vocabulary copy is refreshed — after the reviews, so the server's numbers include them.
 *
 * Queues are flushed only by a session that is online: offline every request would fail as a
 * network error and come straight back to the queue.
 */
export class SessionSync {
  private unsubscribes: Array<() => void> = [];
  private wasOnline = false;
  private reconnecting: Promise<void> | null = null;
  /** An event came while a reconnect ran — the network it found may be a new one. */
  private reconnectAgain = false;
  private draining: Promise<void> | null = null;
  /** A drain asked for while one ran — new entries may have missed its snapshot. */
  private drainAgain = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: SessionSyncDeps) {}

  start(): void {
    if (this.unsubscribes.length > 0) return;
    this.wasOnline = this.isOnline();
    this.unsubscribes = [
      this.deps.onNetworkChange(connected => {
        if (connected) void this.reconnect();
      }),
      this.deps.onForeground(() => void this.reconnect()),
      this.deps.onAuthChange(() => this.onAuthChange()),
    ];
    if (this.wasOnline) void this.drain();
  }

  stop(): void {
    this.unsubscribes.forEach(u => u());
    this.unsubscribes = [];
    this.clearRetry();
  }

  /**
   * One more attempt later. NetInfo can report a network before the server is reachable on
   * it, and a refused entry waits for the school; neither raises another event.
   */
  private scheduleRetry(): void {
    if (this.retryTimer || this.unsubscribes.length === 0) return;
    const timer = setTimeout(() => {
      this.retryTimer = null;
      void this.reconnect();
    }, this.deps.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
    // A pending retry must not keep a Node process (the tests) alive; React Native has no unref.
    (timer as { unref?: () => void }).unref?.();
    this.retryTimer = timer;
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /**
   * Single-flight: events while an attempt runs make one more attempt after it, not one each.
   * They are not dropped — the network that raised them may not be the one the running
   * attempt used.
   */
  reconnect(): Promise<void> {
    if (this.reconnecting) {
      this.reconnectAgain = true;
      return this.reconnecting;
    }
    // Started a tick later so the marker is set before the run can clear it.
    this.reconnecting = Promise.resolve().then(async () => {
      try {
        do {
          this.reconnectAgain = false;
          await this.runReconnect();
        } while (this.reconnectAgain && this.unsubscribes.length > 0);
      } finally {
        // In the same tick as the last check: an event after it starts a new run, none is lost.
        this.reconnecting = null;
      }
    });
    return this.reconnecting;
  }

  /** Sends every queue in turn. A drain asked for while one runs is run once more after it. */
  drain(): Promise<void> {
    if (this.draining) {
      this.drainAgain = true;
      return this.draining;
    }
    // Started a tick later so the marker is set before the run can clear it.
    this.draining = Promise.resolve().then(async () => {
      try {
        await this.runDrain();
      } finally {
        // In the same tick as the last `drainAgain` check: a drain asked for after it starts a
        // new run instead of being folded into one that has already finished.
        this.draining = null;
      }
      this.retryIfLeft();
    });
    return this.draining;
  }

  /**
   * After a drain of an online session: whatever is still queued is tried again later — no
   * event may come to send it (the network was already "up"), and a suspended school only
   * comes back with time.
   */
  private retryIfLeft(): void {
    if (!this.isOnline()) return;
    if (this.deps.hasWaiting?.() || this.deps.hasUndelivered?.()) this.scheduleRetry();
  }

  private async runReconnect(): Promise<void> {
    if (this.isOnline()) {
      // Online already: anything left in the queues goes out now, the network may be what
      // held it back.
      await this.drain();
      return;
    }
    try {
      await this.deps.reconnect();
    } catch (e) {
      console.warn('[SessionSync] Reconnect failed:', e);
    }
    // A reconnect that got through has drained through onAuthChange; one that did not is
    // tried again, the network may not have been ready yet.
    if (!this.isOnline() && this.deps.getAuth().status === 'signedIn') this.scheduleRetry();
  }

  private async runDrain(): Promise<void> {
    do {
      this.drainAgain = false;
      for (const queue of this.deps.queues) {
        if (!this.isOnline()) return;
        try {
          await queue.flush();
        } catch (e) {
          // One queue failing must not hold back the others.
          console.warn(`[SessionSync] Flushing ${queue.name} failed:`, e);
        }
      }
    } while (this.drainAgain);
  }

  private onAuthChange(): void {
    const online = this.isOnline();
    const cameOnline = online && !this.wasOnline;
    this.wasOnline = online;
    if (cameOnline) void this.drain();
  }

  private isOnline(): boolean {
    const { status, offline } = this.deps.getAuth();
    return status === 'signedIn' && !offline;
  }
}

export const sessionSync = new SessionSync({
  onNetworkChange: listener =>
    NetInfo.addEventListener(state => listener(state.isConnected === true)),
  onForeground: listener => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') listener();
    });
    return () => subscription.remove();
  },
  getAuth: () => authStore.getState(),
  onAuthChange: listener => authStore.subscribe(listener),
  reconnect: () => authService.reconnect(),
  // Only a suspended school is worth a timer; a closed one waits for the next network or
  // foreground event, a purged one's entries are dropped (plan 90, Q16).
  hasWaiting: () => exerciseOutboxStore.waitingForSchoolCount > 0,
  // Answers the learner made, kept by a failed send; entries a school holds are counted above
  // (suspended) or wait for an event (closed).
  hasUndelivered: () =>
    reviewQueueStore.pendingCount > 0 ||
    wordCaptureQueueStore.pendingCount > 0 ||
    exerciseOutboxStore.pendingCount - exerciseOutboxStore.heldBySchoolCount > 0,
  queues: [
    { name: 'reviews', flush: () => reviewQueueStore.flush() },
    // Exercises graded offline, then the progress of the sets they finished (B4).
    { name: 'exercise attempts', flush: () => exerciseOutboxStore.flush() },
    { name: 'captured words', flush: () => wordCaptureQueueStore.flush() },
    { name: 'notification reads', flush: () => notificationsStore.flush() },
    // Before the copies below: the translation language decides what they fetch.
    { name: 'account preferences', flush: () => accountPrefsStore.sync() },
    { name: 'vocabulary replica', flush: () => vocabularyReplica.refresh() },
    // Last and longest: walks the courses, at most twice a day each (offline plan, B3).
    { name: 'course materials', flush: () => courseDownloader.run() },
  ],
});
