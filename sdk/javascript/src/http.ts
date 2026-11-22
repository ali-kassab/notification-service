/** Error thrown for any non-2xx response. `body` is the service's JSON error payload. */
export class NotificationServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: { statusCode?: number; error?: string; message?: string | string[] } | null,
  ) {
    const msg = body?.message;
    super(Array.isArray(msg) ? msg.join('; ') : (msg ?? `Request failed with status ${status}`));
    this.name = 'NotificationServiceError';
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpOptions {
  baseUrl: string;
  fetch?: FetchLike;
  /** Request timeout in milliseconds (default 10000). */
  timeoutMs?: number;
}

export function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) throw new Error('baseUrl is required');
  return baseUrl.replace(/\/+$/, '');
}

export function toQuery(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Minimal JSON-over-fetch helper shared by both clients. */
export async function request<T>(
  opts: HttpOptions,
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<T> {
  const doFetch = opts.fetch ?? globalThis.fetch;
  if (!doFetch) throw new Error('No fetch implementation available; pass `fetch` in the options');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await doFetch(`${normalizeBaseUrl(opts.baseUrl)}/api/v1${path}`, {
      method,
      headers: { Accept: 'application/json', ...(body !== undefined && { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new NotificationServiceError(res.status, json);
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}
