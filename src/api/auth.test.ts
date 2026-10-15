import { authService, MfaNotSupportedError } from './auth';
import { apiClient } from './client';
import { apiSettingsStore } from '../store/apiSettingsStore';
import { authStore } from '../store/authStore';
import { makeJwt } from './jwt.test';
import { __resetRefreshTokenCache } from './tokenStorage';
import { biometricStore } from '../store/biometricStore';

/** In-memory stand-in for the device's async storage. */
const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: () => ({
    getItem: async (key: string) => mockStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStorage.delete(key);
    },
  }),
}));

const STORED_USER = { id: 'user-1', email: 'a@b.c', roles: ['student'] };

/** The user of the last session, as a previous sign-in left it. */
function storeSessionUser(user: unknown = STORED_USER) {
  mockStorage.set('user', JSON.stringify(user));
}

function networkDown() {
  return jest.fn(async () => {
    throw new TypeError('Network request failed');
  }) as unknown as typeof fetch;
}

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
    mockStorage.clear();
    __resetRefreshTokenCache();
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
        offline: false,
      });
      expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
        'platform',
        'refresh-token-v2',
        expect.objectContaining({ service: expect.any(String) }),
      );
      expect(authService.getAccessToken()).not.toBeNull();
      // Kept for a start without the server.
      expect(JSON.parse(mockStorage.get('user')!)).toEqual(STORED_USER);
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
      expect(authStore.getState().offline).toBe(false);
      expect(Keychain.resetGenericPassword).toHaveBeenCalled();
    });

    it('forgets the session user together with a rejected token', async () => {
      Keychain.__setStored({ username: 'platform', password: 'expired-refresh' });
      storeSessionUser();
      globalThis.fetch = routeFetch({
        '/auth/refresh': () => jsonResponse(401, { message: 'Invalid refresh token' }),
      }) as unknown as typeof fetch;

      await authService.restore();

      expect(authStore.getState().status).toBe('signedOut');
      expect(mockStorage.has('user')).toBe(false);
    });

    it('opens the app offline as the stored user when the server cannot be reached', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      storeSessionUser();
      globalThis.fetch = networkDown();

      await authService.restore();

      expect(authStore.getState()).toEqual({
        status: 'signedIn',
        user: STORED_USER,
        offline: true,
      });
      expect(authService.getAccessToken()).toBeNull();
      expect(Keychain.resetGenericPassword).not.toHaveBeenCalled();
    });

    it('opens the app before the refresh answers, then confirms the session', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      storeSessionUser();
      let answer: ((r: Response) => void) | null = null;
      globalThis.fetch = jest.fn(
        () => new Promise<Response>(resolve => (answer = resolve)),
      ) as unknown as typeof fetch;

      const restoring = authService.restore();
      await new Promise<void>(resolve => setImmediate(() => resolve()));

      // No spinner while a phone without a route waits out the timeout.
      expect(authStore.getState()).toMatchObject({ status: 'signedIn', offline: true });

      answer!(jsonResponse(200, tokensResponse()));
      await restoring;

      expect(authStore.getState()).toMatchObject({ status: 'signedIn', offline: false });
      expect(authService.getAccessToken()).not.toBeNull();
    });

    it('keeps the session through a gateway that answers 5xx while the auth service starts', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      storeSessionUser();
      globalThis.fetch = routeFetch({
        '/auth/refresh': () => jsonResponse(502, { message: 'Bad Gateway' }),
      }) as unknown as typeof fetch;

      await authService.restore();

      expect(authStore.getState()).toMatchObject({ status: 'signedIn', offline: true });
      expect(Keychain.resetGenericPassword).not.toHaveBeenCalled();
      expect(mockStorage.has('user')).toBe(true);
    });

    it('waits for the connection on the sign-in screen when the stored session has no user', async () => {
      // A session stored by a build that did not keep its user.
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      globalThis.fetch = networkDown();

      await authService.restore();

      expect(authStore.getState().status).toBe('signedOut');
      // Signed out for now, not for good: the sign-in screen offers a retry.
      expect(authStore.getState().offline).toBe(true);
      expect(Keychain.resetGenericPassword).not.toHaveBeenCalled();
      expect(await Keychain.getGenericPassword()).toMatchObject({
        password: 'stored-refresh',
      });
    });

    it('ignores a stored user it cannot read', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      storeSessionUser({ id: 42 });
      globalThis.fetch = networkDown();

      await authService.restore();

      expect(authStore.getState()).toMatchObject({ status: 'signedOut', offline: true });
    });
  });

  describe('reconnect', () => {
    it('brings an offline session back online when the refresh gets through', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      storeSessionUser();
      authStore.setSignedIn(STORED_USER, true);
      globalThis.fetch = routeFetch({
        '/auth/refresh': () => jsonResponse(200, tokensResponse()),
      }) as unknown as typeof fetch;

      await authService.reconnect();

      expect(authStore.getState()).toMatchObject({ status: 'signedIn', offline: false });
      expect(authService.getAccessToken()).not.toBeNull();
    });

    it('stays offline while the server is still out of reach', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      storeSessionUser();
      authStore.setSignedIn(STORED_USER, true);
      globalThis.fetch = networkDown();

      await authService.reconnect();

      expect(authStore.getState()).toEqual({
        status: 'signedIn',
        user: STORED_USER,
        offline: true,
      });
    });

    it('signs out when the server refuses the token of an offline session', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      storeSessionUser();
      authStore.setSignedIn(STORED_USER, true);
      globalThis.fetch = routeFetch({
        '/auth/refresh': () => jsonResponse(401, {}),
      }) as unknown as typeof fetch;

      await authService.reconnect();

      expect(authStore.getState()).toMatchObject({ status: 'signedOut', offline: false });
      expect(mockStorage.has('user')).toBe(false);
    });

    it('restores a session that waited on the sign-in screen for the connection', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      authStore.setSignedOut(true);
      globalThis.fetch = routeFetch({
        '/auth/refresh': () => jsonResponse(200, tokensResponse()),
      }) as unknown as typeof fetch;

      await authService.reconnect();

      expect(authStore.getState()).toMatchObject({ status: 'signedIn', offline: false });
    });

    it('leaves an online session alone', async () => {
      authStore.setSignedIn(STORED_USER);
      globalThis.fetch = jest.fn() as unknown as typeof fetch;

      await authService.reconnect();

      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('leaves a plain sign-in screen alone', async () => {
      authStore.setSignedOut();
      globalThis.fetch = jest.fn() as unknown as typeof fetch;

      await authService.reconnect();

      expect(globalThis.fetch).not.toHaveBeenCalled();
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

    it('stays in the app, offline, when a 401 meets a refresh that cannot reach the server', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      storeSessionUser();
      authStore.setSignedIn(STORED_USER);
      globalThis.fetch = jest.fn(async (url: string) => {
        if (url.includes('/auth/refresh')) throw new TypeError('Network request failed');
        return jsonResponse(401, {});
      }) as unknown as typeof fetch;

      await expect(apiClient.get('/api/v1/enrollments')).rejects.toMatchObject({
        status: 401,
      });
      expect(authStore.getState()).toEqual({
        status: 'signedIn',
        user: STORED_USER,
        offline: true,
      });
      expect(Keychain.resetGenericPassword).not.toHaveBeenCalled();
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

  describe('biometric lock', () => {
    it('reports a session behind a cancelled fingerprint prompt as locked, not gone', async () => {
      jest.spyOn(biometricStore, 'isEnabled').mockReturnValue(true);
      Keychain.getGenericPassword.mockImplementationOnce(async () => {
        throw new Error('User canceled the operation');
      });

      await authService.restore();

      expect(authStore.getState().status).toBe('locked');
      expect(Keychain.resetGenericPassword).not.toHaveBeenCalled();
    });

    it('forgets a locked session for a password sign-in', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });

      await authService.forgetLockedSession();

      expect(authStore.getState().status).toBe('signedOut');
      expect(Keychain.resetGenericPassword).toHaveBeenCalled();
    });

    it('reads the Keychain once per run, not on every refresh', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      globalThis.fetch = routeFetch({
        '/auth/refresh': () => jsonResponse(200, tokensResponse()),
      }) as unknown as typeof fetch;

      await authService.restore();
      await authService.refreshTokens();

      expect(Keychain.getGenericPassword).toHaveBeenCalledTimes(1);
    });
  });

  describe('logout', () => {
    it('clears the keychain and local session even if the request fails', async () => {
      Keychain.__setStored({ username: 'platform', password: 'stored-refresh' });
      storeSessionUser();
      globalThis.fetch = networkDown();

      await authService.logout();

      expect(Keychain.resetGenericPassword).toHaveBeenCalled();
      expect(mockStorage.has('user')).toBe(false);
      expect(authStore.getState()).toEqual({ status: 'signedOut', user: null, offline: false });
      expect(authService.getAccessToken()).toBeNull();
    });
  });
});
