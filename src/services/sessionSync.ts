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
}

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
  private draining: Promise<void> | null = null;
  /** A drain asked for while one ran — new entries may have missed its snapshot. */
  private drainAgain = false;

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
  }

  /** Single-flight: a burst of network and foreground events makes one attempt. */
  reconnect(): Promise<void> {
    if (!this.reconnecting) {
      this.reconnecting = this.runReconnect().finally(() => {
        this.reconnecting = null;
      });
    }
    return this.reconnecting;
  }

  /** Sends every queue in turn. A drain asked for while one runs is run once more after it. */
  drain(): Promise<void> {
    if (this.draining) {
      this.drainAgain = true;
      return this.draining;
    }
    this.draining = this.runDrain().finally(() => {
      this.draining = null;
    });
    return this.draining;
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
    // A reconnect that got through has drained through onAuthChange.
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
