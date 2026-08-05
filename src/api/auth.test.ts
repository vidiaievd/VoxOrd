import { authService, MfaNotSupportedError } from './auth';
import { apiClient } from './client';
import { apiSettingsStore } from '../store/apiSettingsStore';
import { authStore } from '../store/authStore';
import { makeJwt } from './jwt.test';

jest.mock('react-native-keychain', () => {
  let stored: { username: string; password: string } | null = null;
  return {
    setGenericPassword: jest.fn(async (username: string, password: string) => {
      stored = { username, password };
      return true;
    }),
    getGenericPassword: jest.fn(async () => stored ?? false),
    resetGenericPassword: jest.fn(async () => {
      stored = null;
      return true;
    }),
    __setStored: (value: { username: string; password: string } | null) => {
      stored = value;
    },
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Keychain = require('react-native-keychain');

function tokensResponse(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: makeJwt({ sub: 'user-1', email: 'a@b.c', role: 'student' }),
    refreshToken: 'refresh-token-v2',
    accessTokenExpiresAt: '2030-01-01T00:00:00Z',
    refreshTokenExpiresAt: '2030-02-01T00:00:00Z',
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  } as Response;
}

/** Routes mocked fetch calls by URL so tests can describe behaviour per endpoint. */
function routeFetch(handlers: Record<string, (url: string) => Response | Promise<Response>>) {
  return jest.fn(async (url: string) => {
    for (const [fragment, handler] of Object.entries(handlers)) {
      if (url.includes(fragment)) return handler(url);
    }
    throw new Error(`Unexpected request in test: ${url}`);
  });
}

describe('authService', () => {
  beforeEach(() => {
    jest.spyOn(apiSettingsStore, 'get').mockReturnValue('http://10.0.2.2:80');
    Keychain.__setStored(null);
    jest.clearAllMocks();
    authStore.setRestoring();
    authService.install();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('login', () => {
    it('stores the refresh token and signs the user in from the access token claims', async () => {
      globalThis.fetch = routeFetch({
        '/auth/login': () => jsonResponse(200, tokensResponse()),
      }) as unknown as typeof fetch;

      await authService.login('a@b.c', 'pw');

      expect(authStore.getState()).toEqual({
        status: 'signedIn',
        user: { id: 'user-1', email: 'a@b.c', roles: ['student'] },
      });
      expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
        'platform',
        'refresh-token-v2',
        expect.objectContaining({ service: expect.any(String) }),
      );
      expect(authService.getAccessToken()).not.toBeNull();
    });

    it('throws MfaNotSupportedError when the account requires 2FA', async () => {
      globalThis.fetch = routeFetch({
        '/auth/login': () =>
          jsonResponse(200, { mfaRequired: true, challenge: { mfaChallengeToken: 'x' } }),
      }) as unknown as typeof fetch;

      await expect(authService.login('a@b.c', 'pw')).rejects.toBeInstanceOf(
        MfaNotSupportedError,
      );
      expect(authStore.getState().status).not.toBe('signedIn');
      expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
    });

    it('surfaces invalid credentials as an ApiError and stores nothing', async () => {
      globalThis.fetch = routeFetch({
        '/auth/login': () => jsonResponse(401, { message: 'Invalid credentials' }),
      }) as unknown as typeof fetch;

      await expect(authService.login('a@b.c', 'wrong')).rejects.toMatchObject({
        status: 401,
      });
      expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('signs out when no refresh token is stored', async () => {
      globalThis.fetch = routeFetch({}) as unknown as typeof fetch;

      await authService.restore();

      expect(authStore.getState().status).toBe('signedOut');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('exchanges a stored refresh token for a session', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      const fetchMock = routeFetch({
        '/auth/refresh': () => jsonResponse(200, tokensResponse()),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await authService.restore();

      expect(authStore.getState().status).toBe('signedIn');
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ refreshToken: 'stored-refresh' });
    });

    it('discards a refresh token the server rejects', async () => {
      Keychain.__setStored({ username: 'platform', password: 'expired-refresh' });
      globalThis.fetch = routeFetch({
        '/auth/refresh': () => jsonResponse(401, { message: 'Invalid refresh token' }),
      }) as unknown as typeof fetch;

      await authService.restore();

      expect(authStore.getState().status).toBe('signedOut');
      expect(Keychain.resetGenericPassword).toHaveBeenCalled();
    });

    it('keeps the refresh token when the failure is only a network error', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      globalThis.fetch = jest.fn(async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch;

      await authService.restore();

      expect(authStore.getState().status).toBe('signedOut');
      expect(Keychain.resetGenericPassword).not.toHaveBeenCalled();
      expect(await Keychain.getGenericPassword()).toMatchObject({
        password: 'stored-refresh',
      });
    });
  });

  describe('single-flight refresh', () => {
    it('issues exactly one refresh request for concurrent 401s', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });

      let refreshCalls = 0;
      let protectedCalls = 0;
      let resolveRefresh: ((r: Response) => void) | null = null;

      globalThis.fetch = jest.fn(async (url: string) => {
        if (url.includes('/auth/refresh')) {
          refreshCalls += 1;
          // Hold the refresh open so both protected calls are waiting on it.
          return new Promise<Response>(resolve => {
            resolveRefresh = resolve;
          });
        }
        protectedCalls += 1;
        // First call from each of the two requests 401s; retries succeed.
        return protectedCalls <= 2
          ? jsonResponse(401, {})
          : jsonResponse(200, { ok: true });
      }) as unknown as typeof fetch;

      const first = apiClient.get('/api/v1/enrollments');
      const second = apiClient.get('/api/v1/progress');

      // Let both requests reach the 401 handler before the refresh resolves.
      await new Promise<void>(resolve => setImmediate(() => resolve()));
      expect(refreshCalls).toBe(1);

      resolveRefresh!(jsonResponse(200, tokensResponse()));
      await expect(Promise.all([first, second])).resolves.toEqual([
        { ok: true },
        { ok: true },
      ]);

      expect(refreshCalls).toBe(1);
      expect(authStore.getState().status).toBe('signedIn');
    });

    it('signs out and does not retry when the refresh itself fails', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      globalThis.fetch = routeFetch({
        '/auth/refresh': () => jsonResponse(401, {}),
        '/api/v1/enrollments': () => jsonResponse(401, {}),
      }) as unknown as typeof fetch;

      await expect(apiClient.get('/api/v1/enrollments')).rejects.toMatchObject({
        status: 401,
      });
      expect(authStore.getState().status).toBe('signedOut');
    });

    it('allows a new refresh after a previous one settled', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      let refreshCalls = 0;
      globalThis.fetch = jest.fn(async (url: string) => {
        if (url.includes('/auth/refresh')) {
          refreshCalls += 1;
          return jsonResponse(200, tokensResponse());
        }
        return jsonResponse(200, {});
      }) as unknown as typeof fetch;

      await authService.refreshTokens();
      await authService.refreshTokens();

      expect(refreshCalls).toBe(2);
    });
  });

  describe('logout', () => {
    it('clears the keychain and local session even if the request fails', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      globalThis.fetch = jest.fn(async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch;

      await authService.logout();

      expect(Keychain.resetGenericPassword).toHaveBeenCalled();
      expect(authStore.getState()).toEqual({ status: 'signedOut', user: null });
      expect(authService.getAccessToken()).toBeNull();
    });
  });
});
