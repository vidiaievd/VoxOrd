/**
 * Platform authentication state.
 *
 * Follows the settingsStore pattern (plain class + listeners), but is NOT
 * persisted: the refresh token lives in the Keychain (see api/tokenStorage)
 * and everything here is derived from it on start-up.
 */

export type AuthStatus = 'restoring' | 'signedIn' | 'signedOut';

export interface AuthUser {
  id: string;
  email: string | null;
  roles: string[];
}

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

const INITIAL_STATE: AuthState = {
  // Start in 'restoring' so UI never flashes the login screen before the
  // stored session has had a chance to come back.
  status: 'restoring',
  user: null,
};

class AuthStore {
  private state: AuthState = { ...INITIAL_STATE };
  private listeners: Set<() => void> = new Set();

  getState(): AuthState {
    return { ...this.state };
  }

  setRestoring(): void {
    this.state = { status: 'restoring', user: null };
    this.notify();
  }

  setSignedIn(user: AuthUser): void {
    this.state = { status: 'signedIn', user };
    this.notify();
  }

  setSignedOut(): void {
    this.state = { status: 'signedOut', user: null };
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
