import { apiClient, ApiError } from './client';
import { decodeJwtPayload } from './jwt';
import { clearRefreshToken, loadRefreshToken, saveRefreshToken, BiometricLockedError } from './tokenStorage';
import { clearSessionUser, loadSessionUser, saveSessionUser } from './sessionUser';
import { authStore, AuthUser } from '../store/authStore';
import type { AuthTokensResponse } from './types';

const LOGIN_PATH = '/api/v1/auth/login';
const REFRESH_PATH = '/api/v1/auth/refresh';
const LOGOUT_PATH = '/api/v1/auth/logout';

/**
 * Thrown when the account has 2FA enabled. The login endpoint answers with an
 * MFA challenge instead of tokens, and completing that challenge
 * (`POST /api/v1/auth/mfa/challenge`) is out of scope for the mobile client —
 * see Risk 2 in docs/plans/course-integration-plan.md.
 */
export class MfaNotSupportedError extends Error {
  constructor() {
    super('MFA_NOT_SUPPORTED');
    this.name = 'MfaNotSupportedError';
  }
}

type LoginResponse = AuthTokensResponse | { mfaRequired: true; challenge: unknown };

/**
 * How a refresh ended. `unreachable` — the server was not reached, or answered as a server
 * that is down (5xx, 429) rather than one that looked at the token: the session is kept and
 * the app carries on without it. `failed` — no token, a token the server refused, or one
 * locked behind the fingerprint: there is no session to carry on with.
 */
type RefreshOutcome = 'refreshed' | 'unreachable' | 'failed';

/**
 * Whether a refresh error says nothing about the token. A gateway answering 502 while the
 * auth service starts must not cost the learner their session.
 */
function isUnreachable(e: unknown): boolean {
  if (!(e instanceof ApiError)) return false;
  return e.retriable || e.status === 429 || (e.status !== null && e.status >= 500);
}

function isMfaChallenge(res: LoginResponse): res is { mfaRequired: true; challenge: unknown } {
  return (res as { mfaRequired?: boolean }).mfaRequired === true;
}

function toAuthUser(accessToken: string): AuthUser | null {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return null;
  return { id: payload.sub, email: payload.email, roles: payload.roles };
}

class AuthService {
  /** Access token is memory-only by design; never written to storage. */
  private accessToken: string | null = null;

  /**
   * Single-flight guard. Concurrent 401s must trigger exactly one refresh
   * request — otherwise parallel screen loads would each burn a refresh token
   * and race each other into a signed-out state.
   */
  private refreshInFlight: Promise<RefreshOutcome> | null = null;

  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** Wires this service into the API client. Call once at app start-up. */
  install(): void {
    apiClient.setAuthHeaderProvider(() => this.accessToken);
    apiClient.setUnauthorizedHandler(() => this.handleUnauthorized());
  }

  async login(email: string, password: string): Promise<void> {
    const res = await apiClient.post<LoginResponse>(
      LOGIN_PATH,
      { email, password },
      { skipAuth: true },
    );

    if (isMfaChallenge(res)) {
      throw new MfaNotSupportedError();
    }

    await this.applyTokens(res);
  }

  /**
   * Cold-start session restore. With a stored session whose user is known the app opens at
   * once, offline, and the refresh confirms it in the background — a phone without a route to
   * the server would otherwise sit on a spinner until the request timed out. Resolves once the
   * refresh has settled.
   */
  async restore(): Promise<void> {
    authStore.setRestoring();

    let refreshToken: string | null;
    try {
      refreshToken = await loadRefreshToken();
    } catch (e) {
      if (e instanceof BiometricLockedError) {
        authStore.setLocked();
        return;
      }
      throw e;
    }
    if (!refreshToken) {
      authStore.setSignedOut();
      return;
    }

    const storedUser = await loadSessionUser();
    if (storedUser) authStore.setSignedIn(storedUser, true);

    const outcome = await this.refresh();
    if (outcome === 'unreachable') {
      // performRefresh() kept the token: the server is out of reach, not the session gone.
      await this.continueOffline();
    } else if (outcome === 'failed') {
      // performRefresh() already dropped a token the server refused.
      this.clearSession();
    }
  }

  /**
   * Give up a session locked behind the fingerprint and sign in with the password instead —
   * the way out for a finger that is not accepted, or a device whose biometrics changed.
   */
  async forgetLockedSession(): Promise<void> {
    await this.forgetStoredSession();
    this.clearSession();
  }

  async logout(): Promise<void> {
    try {
      // Best-effort server-side revocation — a failure here (offline, expired
      // access token) must still clear the local session.
      await apiClient.post(LOGOUT_PATH);
    } catch (e) {
      console.warn('[Auth] Logout request failed, clearing local session anyway:', e);
    }
    await this.forgetStoredSession();
    this.clearSession();
  }

  /** Refreshes tokens, collapsing concurrent callers onto one request. */
  async refreshTokens(): Promise<boolean> {
    return (await this.refresh()) === 'refreshed';
  }

  private refresh(): Promise<RefreshOutcome> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  /**
   * Invoked by the API client on a 401. Returns true to retry the request. A refresh that
   * did not reach the server leaves the learner in the app, working from the device —
   * signing out over a dropped connection is what kept the app shut without one.
   */
  private async handleUnauthorized(): Promise<boolean> {
    const outcome = await this.refresh();
    if (outcome === 'refreshed') return true;
    if (outcome === 'unreachable') {
      await this.continueOffline();
    } else {
      this.clearSession();
    }
    return false;
  }

  /** Never throws — every failure is an outcome so callers can branch simply. */
  private async performRefresh(): Promise<RefreshOutcome> {
    let refreshToken: string | null;
    try {
      refreshToken = await loadRefreshToken();
    } catch {
      // Locked behind the fingerprint: no refresh now; restore() is what offers the unlock.
      return 'failed';
    }
    if (!refreshToken) return 'failed';

    try {
      const tokens = await apiClient.post<AuthTokensResponse>(
        REFRESH_PATH,
        { refreshToken },
        { skipAuth: true },
      );
      return (await this.applyTokens(tokens)) ? 'refreshed' : 'failed';
    } catch (e) {
      if (isUnreachable(e)) {
        // No answer about the token — keep it in storage so a later attempt (or the next
        // cold start) can still restore the session.
        console.warn('[Auth] Refresh failed (server unreachable):', (e as Error).message);
        return 'unreachable';
      }
      // The server rejected this token; it will never work again. Drop it so
      // we stop replaying a doomed refresh on every start-up.
      console.warn('[Auth] Refresh rejected, discarding stored token:', e);
      await this.forgetStoredSession();
      return 'failed';
    }
  }

  /** True when the tokens gave a session; false when the access token was unusable. */
  private async applyTokens(tokens: AuthTokensResponse): Promise<boolean> {
    this.accessToken = tokens.accessToken;
    await saveRefreshToken(tokens.refreshToken);

    const user = toAuthUser(tokens.accessToken);
    if (user) {
      await saveSessionUser(user);
      authStore.setSignedIn(user);
      return true;
    }
    // A token we cannot even decode is unusable — fail closed rather than
    // pretending to be signed in with an unknown identity.
    console.warn('[Auth] Access token could not be decoded');
    await this.forgetStoredSession();
    this.clearSession();
    return false;
  }

  /**
   * The server is out of reach and the session stored: carry on as the user of the last
   * sign-in, without an access token. A session stored by a build that did not keep its user
   * has no one to carry on as — that one waits on the sign-in screen for the connection.
   */
  private async continueOffline(): Promise<void> {
    const user = await loadSessionUser();
    this.accessToken = null;
    if (user) {
      authStore.setSignedIn(user, true);
    } else {
      authStore.setSignedOut(true);
    }
  }

  /** Drops the stored session: the refresh token and whose it was. */
  private async forgetStoredSession(): Promise<void> {
    await Promise.all([clearRefreshToken(), clearSessionUser()]);
  }

  /** Drops the in-memory session only; storage is handled by the caller. */
  private clearSession(): void {
    this.accessToken = null;
    authStore.setSignedOut();
  }
}

export const authService = new AuthService();
