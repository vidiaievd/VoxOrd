import { apiClient, ApiError } from './client';
import { apiSettingsStore } from '../store/apiSettingsStore';

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('apiClient', () => {
  beforeEach(() => {
    jest.spyOn(apiSettingsStore, 'get').mockReturnValue('http://10.0.2.2:80');
    apiClient.setAuthHeaderProvider(null);
    apiClient.setUnauthorizedHandler(null);
    globalThis.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { hello: 'world' }));

    const result = await apiClient.get<{ hello: string }>('/api/v1/things');

    expect(result).toEqual({ hello: 'world' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://10.0.2.2:80/api/v1/things',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('maps non-2xx responses to ApiError with status and message', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(404, { message: 'Not found' }),
    );

    await expect(apiClient.get('/api/v1/missing')).rejects.toMatchObject({
      status: 404,
      message: 'Not found',
    });
  });

  it('maps network failures to a retriable ApiError with null status', async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));

    let caught: ApiError | undefined;
    try {
      await apiClient.get('/api/v1/things');
    } catch (e) {
      caught = e as ApiError;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBeNull();
    expect(caught?.retriable).toBe(true);
  });

  it('maps AbortError (timeout) to a TIMEOUT ApiError', async () => {
    (globalThis.fetch as jest.Mock).mockImplementation(() => {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      return Promise.reject(err);
    });

    await expect(apiClient.get('/api/v1/slow')).rejects.toMatchObject({
      code: 'TIMEOUT',
      status: null,
    });
  });

  it('attaches Authorization header from the auth provider', async () => {
    apiClient.setAuthHeaderProvider(() => 'test-token');
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, {}));

    await apiClient.get('/api/v1/things');

    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });

  it('does not attach Authorization header when skipAuth is set', async () => {
    apiClient.setAuthHeaderProvider(() => 'test-token');
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, {}));

    await apiClient.get('/api/v1/auth/login', { skipAuth: true });

    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('on 401, calls the unauthorized handler once and retries if it returns true', async () => {
    let call = 0;
    (globalThis.fetch as jest.Mock).mockImplementation(() => {
      call += 1;
      return Promise.resolve(call === 1 ? jsonResponse(401, {}) : jsonResponse(200, { ok: true }));
    });
    const handler = jest.fn().mockResolvedValue(true);
    apiClient.setUnauthorizedHandler(handler);

    const result = await apiClient.get<{ ok: boolean }>('/api/v1/protected');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });

  it('on 401, does not retry a second time even if fetch keeps returning 401', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(401, { message: 'Unauthorized' }));
    const handler = jest.fn().mockResolvedValue(true);
    apiClient.setUnauthorizedHandler(handler);

    await expect(apiClient.get('/api/v1/protected')).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not invoke the unauthorized handler when skipAuth is set', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue(jsonResponse(401, {}));
    const handler = jest.fn().mockResolvedValue(true);
    apiClient.setUnauthorizedHandler(handler);

    await expect(
      apiClient.get('/api/v1/auth/login', { skipAuth: true }),
    ).rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns undefined for 204 No Content', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      status: 204,
      ok: true,
      text: async () => '',
    } as Response);

    const result = await apiClient.delete('/api/v1/things/1');

    expect(result).toBeUndefined();
  });
});
