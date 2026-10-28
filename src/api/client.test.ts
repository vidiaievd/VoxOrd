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

/**
 * Just enough of React Native's XMLHttpRequest for `stream`: the test plays the response —
 * headers, pieces of body, the end — on the request it was sent.
 */
class FakeXhr {
  static last: FakeXhr[] = [];
  readyState = 0;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  sent: string | null = null;
  headers: Record<string, string> = {};
  private responseHeaders: Record<string, string> = {};
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader(name: string) {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }
  send(body: string | null) {
    this.sent = body;
  }
  abort() {
    this.onabort?.();
  }
  respond(status: number, contentType: string) {
    this.status = status;
    this.responseHeaders['content-type'] = contentType;
    this.readyState = 2;
  }
  piece(text: string) {
    this.readyState = 3;
    this.responseText += text;
    this.onprogress?.();
  }
  finish() {
    this.readyState = 4;
    this.onload?.();
  }
}

describe('apiClient.stream', () => {
  const realXhr = globalThis.XMLHttpRequest;
  const flush = () => new Promise<void>((r) => setImmediate(r));

  beforeEach(() => {
    jest.spyOn(apiSettingsStore, 'get').mockReturnValue('http://gw');
    apiClient.setAuthHeaderProvider(() => 'tok');
    apiClient.setUnauthorizedHandler(null);
    FakeXhr.last = [];
    (globalThis as any).XMLHttpRequest = FakeXhr;
  });

  afterEach(() => {
    (globalThis as any).XMLHttpRequest = realXhr;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('passes an event stream on piece by piece, each piece once', async () => {
    const pieces: string[] = [];
    const done = apiClient.stream('/x', { method: 'POST', body: { a: 1 }, query: { stream: 1 }, onText: (t) => pieces.push(t) });
    const xhr = FakeXhr.last[0];
    expect(xhr.url).toBe('http://gw/x?stream=1');
    expect(xhr.sent).toBe('{"a":1}');
    expect(xhr.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });

    xhr.respond(200, 'text/event-stream; charset=utf-8');
    xhr.piece('event: delta\n');
    xhr.piece('data: {}\n\n');
    xhr.finish();
    expect(await done).toEqual({ streamed: true, body: undefined });
    expect(pieces).toEqual(['event: delta\n', 'data: {}\n\n']);
  });

  it('reads a response that is not a stream as request does, failures included', async () => {
    const onText = jest.fn();
    const ok = apiClient.stream('/x', { method: 'POST', onText });
    FakeXhr.last[0].respond(200, 'application/json');
    FakeXhr.last[0].piece('{"callId":"c"}');
    FakeXhr.last[0].finish();
    expect(await ok).toEqual({ streamed: false, body: { callId: 'c' } });

    const refused = apiClient.stream('/x', { method: 'POST', onText });
    FakeXhr.last[1].respond(409, 'application/json');
    FakeXhr.last[1].piece('{"message":"no","reason":"quota"}');
    FakeXhr.last[1].finish();
    await expect(refused).rejects.toMatchObject({ status: 409, body: { reason: 'quota' } });
    expect(onText).not.toHaveBeenCalled();
  });

  it('refreshes once on 401 and asks again', async () => {
    const handler = jest.fn().mockResolvedValue(true);
    apiClient.setUnauthorizedHandler(handler);
    const done = apiClient.stream('/x', { method: 'POST', onText: () => undefined });
    FakeXhr.last[0].respond(401, 'application/json');
    FakeXhr.last[0].finish();
    await flush();
    FakeXhr.last[1].respond(200, 'text/event-stream');
    FakeXhr.last[1].finish();
    expect(await done).toEqual({ streamed: true, body: undefined });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('gives up when nothing arrives for the idle timeout, not before', async () => {
    jest.useFakeTimers();
    const done = apiClient.stream('/x', { method: 'POST', idleTimeoutMs: 1000, onText: () => undefined });
    const xhr = FakeXhr.last[0];
    xhr.respond(200, 'text/event-stream');
    jest.advanceTimersByTime(900);
    xhr.piece(': still here\n\n');
    jest.advanceTimersByTime(900);
    xhr.piece(': still here\n\n');
    jest.advanceTimersByTime(1000);
    await expect(done).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('a broken connection is a network error', async () => {
    const done = apiClient.stream('/x', { method: 'POST', onText: () => undefined });
    FakeXhr.last[0].onerror?.();
    await expect(done).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: null });
  });
});
