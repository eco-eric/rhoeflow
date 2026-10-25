"use client";

/** A structured API failure (the route handlers' `{ error: { code, message, details } }`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> | undefined,
  ) {
    super(message);
  }
  /** No response at all: the phone is offline or the server is unreachable. */
  get offline(): boolean {
    return this.status === 0;
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? {} : { "content-type": "application/json" },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      cache: "no-store",
    });
  } catch (e) {
    throw new ApiError(0, "offline", e instanceof Error ? e.message : "network error", undefined);
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "http_error", err?.message ?? res.statusText, err?.details);
  }
  return body as T;
}

export async function apiText(path: string): Promise<string> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new ApiError(res.status, "http_error", res.statusText, undefined);
  return res.text();
}
