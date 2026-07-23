import { apiSettingsStore } from '../store/apiSettingsStore';

const DEFAULT_TIMEOUT_MS = 15000;

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly retriable: boolean;

  constructor(params: {
    message: string;
    status: number | null;
    code?: string | null;
    retriable?: boolean;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.status = params.status;
    this.code = params.code ?? null;
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

  private async doRequest<T>(
    path: string,
    options: RequestOptions,
    allowUnauthorizedRetry: boolean,
  ): Promise<T> {
    const baseUrl = apiSettingsStore.get('baseUrl');
    const query = buildQueryString(options.query);
    const url = `${baseUrl}${path}${query}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
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

    const text = await response.text();
    let parsed: any = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        if (!response.ok) {
          throw new ApiError({
            message: `Request failed (${response.status}): ${path}`,
            status: response.status,
          });
        }
        throw new ApiError({
          message: `Failed to parse response as JSON: ${path}`,
          status: response.status,
          code: 'PARSE_ERROR',
        });
      }
    }

    if (!response.ok) {
      const message =
        (parsed && (parsed.message || parsed.error)) ??
        `Request failed (${response.status}): ${path}`;
      throw new ApiError({
        message: Array.isArray(message) ? message.join(', ') : String(message),
        status: response.status,
        code: parsed?.code ?? null,
      });
    }

    return parsed as T;
  }

  get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
