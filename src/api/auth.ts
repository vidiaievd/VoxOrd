import { apiClient, ApiError } from './client';
import { decodeJwtPayload } from './jwt';
import {
  clearRefreshToken,
  loadRefreshToken,
  saveRefreshToken,
} from './tokenStorage';
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
  private refreshInFlight: Promise<boolean> | null = null;

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
   * Cold-start session restore. Resolves once the store has left the
   * 'restoring' state, so app bootstrap can await it before rendering.
   */
  async restore(): Promise<void> {
    authStore.setRestoring();

    const refreshToken = await loadRefreshToken();
    if (!refreshToken) {
      authStore.setSignedOut();
      return;
    }

    const refreshed = await this.refreshTokens();
    if (!refreshed) {
      // No usable session right now. Storage is left alone here on purpose:
      // performRefresh() already dropped the token if the server rejected it,
      // and keeps it when the failure was merely a network blip.
      this.clearSession();
    }
  }

  async logout(): Promise<void> {
    try {
      // Best-effort server-side revocation — a failure here (offline, expired
      // access token) must still clear the local session.
      await apiClient.post(LOGOUT_PATH);
    } catch (e) {
      console.warn('[Auth] Logout request failed, clearing local session anyway:', e);
    }
    await clearRefreshToken();
    this.clearSession();
  }

  /** Refreshes tokens, collapsing concurrent callers onto one request. */
  refreshTokens(): Promise<boolean> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  /** Invoked by the API client on a 401. Returns true to retry the request. */
  private async handleUnauthorized(): Promise<boolean> {
    const refreshed = await this.refreshTokens();
    if (!refreshed) {
      this.clearSession();
    }
    return refreshed;
  }

  /** Never throws — returns false on any failure so callers can branch simply. */
  private async performRefresh(): Promise<boolean> {
    const refreshToken = await loadRefreshToken();
    if (!refreshToken) return false;

    try {
      const tokens = await apiClient.post<AuthTokensResponse>(
        REFRESH_PATH,
        { refreshToken },
        { skipAuth: true },
      );
      await this.applyTokens(tokens);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.retriable) {
        // Network blip rather than a rejected token — keep it in storage so a
        // later attempt (or the next cold start) can still restore the session.
        console.warn('[Auth] Refresh failed (network):', e.message);
      } else {
        // The server rejected this token; it will never work again. Drop it so
        // we stop replaying a doomed refresh on every start-up.
        console.warn('[Auth] Refresh rejected, discarding stored token:', e);
        await clearRefreshToken();
      }
      return false;
    }
  }

  private async applyTokens(tokens: AuthTokensResponse): Promise<void> {
    this.accessToken = tokens.accessToken;
    await saveRefreshToken(tokens.refreshToken);

    const user = toAuthUser(tokens.accessToken);
    if (user) {
      authStore.setSignedIn(user);
    } else {
      // A token we cannot even decode is unusable — fail closed rather than
      // pretending to be signed in with an unknown identity.
      console.warn('[Auth] Access token could not be decoded');
      await clearRefreshToken();
      this.clearSession();
    }
  }

  /** Drops the in-memory session only; storage is handled by the caller. */
  private clearSession(): void {
    this.accessToken = null;
    authStore.setSignedOut();
  }
}

export const authService = new AuthService();
