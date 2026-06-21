import type { ApiResponse, ErrorCode } from '@chinatalent/shared';
import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL;

/** Error thrown when the API returns `{ success: false }` or a non-2xx status. */
export class ApiError extends Error {
  /** Machine-readable error identifier from the envelope, when present. */
  readonly code?: ErrorCode;
  /** HTTP status code of the response. */
  readonly status: number;

  constructor(message: string, status: number, code?: ErrorCode) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Any JSON-serializable value sent as a request body. */
type JsonBody = unknown;

interface RequestOptions {
  /** JSON body to send (for POST/PUT/PATCH). */
  body?: JsonBody;
  /** Extra headers to merge in. */
  headers?: Record<string, string>;
  /** Optional AbortSignal to cancel the request. */
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError('VITE_API_URL is not configured', 0);
  }

  // Attach the current Supabase access token so the backend can authenticate.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const url = `${API_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (cause) {
    // Network failure, CORS, DNS, offline, etc. — fetch rejects rather than
    // returning a response.
    throw new ApiError(cause instanceof Error ? cause.message : 'Network request failed', 0);
  }

  // Parse the envelope. A few endpoints (or proxies) may return non-JSON on
  // hard failures, so guard the parse.
  let envelope: ApiResponse<T> | null = null;
  try {
    envelope = (await res.json()) as ApiResponse<T>;
  } catch {
    envelope = null;
  }

  if (!envelope) {
    throw new ApiError(`Unexpected response (HTTP ${res.status})`, res.status);
  }

  if (!envelope.success) {
    throw new ApiError(
      envelope.error ?? `Request failed (HTTP ${res.status})`,
      res.status,
      envelope.code,
    );
  }

  // `data` is optional in the envelope; callers expecting void can ignore it.
  return envelope.data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions): Promise<T> => request<T>('GET', path, options),
  post: <T>(path: string, body?: JsonBody, options?: RequestOptions): Promise<T> =>
    request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: JsonBody, options?: RequestOptions): Promise<T> =>
    request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: JsonBody, options?: RequestOptions): Promise<T> =>
    request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>('DELETE', path, options),
};
