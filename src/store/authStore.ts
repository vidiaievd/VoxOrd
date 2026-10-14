/**
 * Platform authentication state.
 *
 * Follows the settingsStore pattern (plain class + listeners), but is NOT
 * persisted: the refresh token lives in the Keychain (see api/tokenStorage)
 * and everything here is derived from it on start-up.
 */

/**
 * `locked`: a session is stored behind the fingerprint and was not unlocked — the prompt was
 * cancelled. Not signed out: unlocking brings it back without a password.
 */
export type AuthStatus = 'restoring' | 'signedIn' | 'signedOut' | 'locked';

export interface AuthUser {
  id: string;
  email: string | null;
  roles: string[];
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /**
   * Signed out only because the server could not be reached: a session is still stored and
   * will come back with the connection. The sign-in screen says «no connection» and offers a
   * retry instead of asking for a password the learner already gave.
   */
  offline: boolean;
}

const INITIAL_STATE: AuthState = {
  // Start in 'restoring' so UI never flashes the login screen before the
  // stored session has had a chance to come back.
  status: 'restoring',
  user: null,
  offline: false,
};

class AuthStore {
  private state: AuthState = { ...INITIAL_STATE };
  private listeners: Set<() => void> = new Set();

  getState(): AuthState {
    return { ...this.state };
  }

  setRestoring(): void {
    this.state = { status: 'restoring', user: null, offline: false };
    this.notify();
  }

  setSignedIn(user: AuthUser): void {
    this.state = { status: 'signedIn', user, offline: false };
    this.notify();
  }

  setLocked(): void {
    this.state = { status: 'locked', user: null, offline: false };
    this.notify();
  }

  setSignedOut(offline = false): void {
    this.state = { status: 'signedOut', user: null, offline };
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

export const authStore = new AuthStore();
