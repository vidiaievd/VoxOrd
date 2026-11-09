import { apiSettingsStore } from '../store/apiSettingsStore';

const DEFAULT_TIMEOUT_MS = 15000;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly retriable: boolean;
  /**
   * The error response as the server sent it, parsed, or null. For the refusals that carry
   * more than a code — the id of an attempt already in progress (409), the prompts whose
   * recordings were refused (`read_aloud`, 422 `{ code, itemIds }`).
   */
  readonly body: unknown;

  constructor(params: {
    message: string;
    status: number | null;
    code?: string | null;
    retriable?: boolean;
    body?: unknown;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code ?? null;
    this.body = params.body ?? null;
    // Network failures and timeouts are retriable; 4xx/5xx application
    // errors are not (the caller decides whether to retry the *request*,
    // e.g. after a token refresh on 401).
    this.retriable = params.retriable ?? params.status === null;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
  /** Skip attaching the Authorization header (login/refresh calls). */
  skipAuth?: boolean;
  /** Extra headers, sent as given; the client's own headers win on a clash. */
  headers?: Record<string, string>;
}

/**
 * Supplies the current access token (or null) for authenticated requests.
 * Set by the auth layer (Step 1.3) once it exists; requests made before
 * that point simply go out unauthenticated.
 */
export type AuthHeaderProvider = () => string | null;

/**
 * Called on a 401 response for a request that was NOT already retried.
 * Returns true if the caller should retry the original request once (e.g.
 * because a token refresh succeeded), false to give up and surface the 401.
 * Wired by the auth layer (Step 1.3); absent by default.
 */
export type UnauthorizedHandler = () => Promise<boolean>;

/** What `stream` hands back once the response is complete. */
export interface StreamResult {
  /** True when the server answered with `text/event-stream` — its text went to `onText`. */
  streamed: boolean;
  /** The parsed JSON body of a response that was not streamed (undefined for none). */
  body: unknown;
}

export interface StreamOptions extends Omit<RequestOptions, 'timeoutMs'> {
  /** The text of an event stream as it arrives, piece by piece. */
  onText: (text: string) => void;
  /** Gives up when nothing arrives for this long — not a limit on the whole response. */
  idleTimeoutMs?: number;
}

function buildQueryString(query?: RequestOptions['query']): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    );
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

class ApiClient {
  private authHeaderProvider: AuthHeaderProvider | null = null;
  private unauthorizedHandler: UnauthorizedHandler | null = null;

  setAuthHeaderProvider(provider: AuthHeaderProvider | null): void {
    this.authHeaderProvider = provider;
  }

  setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
    this.unauthorizedHandler = handler;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.doRequest<T>(path, options, /* allowUnauthorizedRetry */ true);
  }

  private prepare(
    path: string,
    options: Omit<RequestOptions, 'timeoutMs'>,
    accept: string,
  ): { url: string; headers: Record<string, string> } {
    const baseUrl = apiSettingsStore.get('baseUrl');
    const query = buildQueryString(options.query);
    const url = `${baseUrl}${path}${query}`;

    const headers: Record<string, string> = {
      ...options.headers,
      Accept: accept,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (!options.skipAuth && this.authHeaderProvider) {
      const token = this.authHeaderProvider();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }
    return { url, headers };
  }

  private async doRequest<T>(
    path: string,
    options: RequestOptions,
    allowUnauthorizedRetry: boolean,
  ): Promise<T> {
    const { url, headers } = this.prepare(path, options, 'application/json');

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e?.name === 'AbortError') {
        throw new ApiError({
          message: `Request timed out after ${timeoutMs}ms: ${path}`,
          status: null,
          code: 'TIMEOUT',
        });
      }
      throw new ApiError({
        message: e?.message ?? `Network request failed: ${path}`,
        status: null,
        code: 'NETWORK_ERROR',
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 401 && !options.skipAuth && allowUnauthorizedRetry && this.unauthorizedHandler) {
      const shouldRetry = await this.unauthorizedHandler();
      if (shouldRetry) {
        return this.doRequest<T>(path, options, /* allowUnauthorizedRetry */ false);
      }
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return readJson(response.status, await response.text(), path) as T;
  }

  /**
   * A request whose answer may come as server-sent events. `fetch` in React Native has no
   * readable body, so this goes over `XMLHttpRequest`, whose `responseText` grows as the
   * response arrives. An event stream's text goes to `onText` as it comes; any other response
   * is read as `request` reads it — a non-2xx throws the same `ApiError`, a 401 refreshes and
   * retries once.
   */
  stream(path: string, options: StreamOptions): Promise<StreamResult> {
    return this.doStream(path, options, /* allowUnauthorizedRetry */ true);
  }

  private async doStream(
    path: string,
    options: StreamOptions,
    allowUnauthorizedRetry: boolean,
  ): Promise<StreamResult> {
    const { url, headers } = this.prepare(path, options, 'text/event-stream, application/json');
    const idleMs = options.idleTimeoutMs ?? DEFAULT_TIMEOUT_MS;

    const { status, streamed, text } = await new Promise<{
      status: number;
      streamed: boolean;
      text: string;
    }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let idle: ReturnType<typeof setTimeout> | null = null;
      let timedOut = false;
      let seen = 0;
      let streaming: boolean | null = null;

      const arm = () => {
        if (idle) clearTimeout(idle);
        idle = setTimeout(() => {
          timedOut = true;
          xhr.abort();
        }, idleMs);
      };
      const isStream = () => {
        if (streaming === null && xhr.readyState >= 2) {
          streaming = (xhr.getResponseHeader('Content-Type') ?? '').includes('text/event-stream');
        }
        return streaming === true;
      };
      const flush = () => {
        if (!isStream() || xhr.status < 200 || xhr.status >= 300) return;
        const all = xhr.responseText ?? '';
        if (all.length > seen) {
          const piece = all.slice(seen);
          seen = all.length;
          options.onText(piece);
        }
      };
      const fail = (error: ApiError) => {
        if (idle) clearTimeout(idle);
        reject(error);
      };

      xhr.open(options.method ?? 'POST', url);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      // Assigned before send: React Native reports the body piece by piece only then.
      xhr.onprogress = () => {
        arm();
        flush();
      };
      xhr.onload = () => {
        if (idle) clearTimeout(idle);
        flush();
        resolve({ status: xhr.status, streamed: isStream(), text: xhr.responseText ?? '' });
      };
      xhr.onerror = () =>
        fail(new ApiError({ message: `Network request failed: ${path}`, status: null, code: 'NETWORK_ERROR' }));
      xhr.onabort = () =>
        fail(
          timedOut
            ? new ApiError({ message: `Request timed out after ${idleMs}ms: ${path}`, status: null, code: 'TIMEOUT' })
            : new ApiError({ message: `Request aborted: ${path}`, status: null, code: 'NETWORK_ERROR' }),
        );
      arm();
      xhr.send(options.body !== undefined ? JSON.stringify(options.body) : null);
    });

    if (status === 401 && !options.skipAuth && allowUnauthorizedRetry && this.unauthorizedHandler) {
      if (await this.unauthorizedHandler()) {
        return this.doStream(path, options, /* allowUnauthorizedRetry */ false);
      }
    }
    if (streamed && status >= 200 && status < 300) return { streamed: true, body: undefined };
    if (status === 204) return { streamed: false, body: undefined };
    return { streamed: false, body: readJson(status, text, path) };
  }

  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

/** A response's JSON, or the `ApiError` a non-2xx (or unreadable 2xx) response stands for. */
function readJson(status: number, text: string, path: string): unknown {
  const ok = status >= 200 && status < 300;
  let parsed: any = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      if (!ok) {
        throw new ApiError({
          message: `Request failed (${status}): ${path}`,
          status,
        });
      }
      throw new ApiError({
        message: `Failed to parse response as JSON: ${path}`,
        status,
        code: 'PARSE_ERROR',
      });
    }
  }

  if (!ok) {
    const message =
      (parsed && (parsed.message || parsed.error)) ??
      `Request failed (${status}): ${path}`;
    throw new ApiError({
      message: Array.isArray(message) ? message.join(', ') : String(message),
      status,
      code: parsed?.code ?? null,
      body: parsed ?? null,
    });
  }

  return parsed;
}

export const apiClient = new ApiClient();
