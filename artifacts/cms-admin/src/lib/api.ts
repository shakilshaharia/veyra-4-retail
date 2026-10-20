// One fetch wrapper for the whole admin. Every API error has the same shape,
// so forms can show the message and mark the exact fields that failed.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

let onUnauthenticated: (() => void) | null = null;
export function setUnauthenticatedHandler(handler: () => void) {
  onUnauthenticated = handler;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const isForm = options.body instanceof FormData;
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const error = (data as { error?: { message?: string; code?: string; fields?: Record<string, string> } } | null)?.error;
    if (response.status === 401 && !path.startsWith('/api/auth/')) onUnauthenticated?.();
    throw new ApiError(
      response.status,
      error?.message ?? (response.status >= 500 ? 'Something went wrong on the server. Please try again.' : 'That request could not be completed.'),
      error?.code ?? 'error',
      error?.fields ?? {},
    );
  }
  return data as T;
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });
export const patch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body });
export const put = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.name !== 'AbortError') return 'Could not reach the server. Check your connection and try again.';
  return 'Something went wrong.';
}

export function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
