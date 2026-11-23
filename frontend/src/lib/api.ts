import { hc } from "hono/client";
import type { PickResponseByStatusCode } from "hono/client";
import type { ApiType } from "backend";

import { session } from "./session.svelte";

const BACKEND_URL = import.meta.env.BACKEND_URL ?? "http://localhost:3000";

/** Access tokens last 15 minutes, so an expired one is the normal case, not an error. */
const REFRESH_PATH = "/auth/refresh";

const refreshTokens = async (refreshToken: string) => {
  const res = await fetch(`${BACKEND_URL}${REFRESH_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { accessToken: string; refreshToken: string };
};

// Refresh tokens are single-use, so concurrent 401s must share one refresh instead of racing and
// invalidating each other's token.
let inFlightRefresh: Promise<boolean> | null = null;

const refreshOnce = () => {
  inFlightRefresh ??= (async () => {
    const current = session.current;
    if (!current) return false;
    const tokens = await refreshTokens(current.refreshToken);
    if (!tokens) {
      session.clear();
      return false;
    }
    session.setTokens(tokens);
    return true;
  })().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
};

const withAuth = (init: RequestInit | undefined, accessToken: string | undefined): RequestInit => {
  const headers = new Headers(init?.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return { ...init, headers };
};

/** Attaches the participant's bearer token and retries once through a token refresh on 401. */
const authFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.endsWith(REFRESH_PATH)) {
    return fetch(input, init);
  }

  const res = await fetch(input, withAuth(init, session.current?.accessToken));
  if (res.status !== 401 || !session.current) {
    return res;
  }

  if (!(await refreshOnce())) {
    return res;
  }
  return fetch(input, withAuth(init, session.current?.accessToken));
};

/**
 * Error statuses are handled centrally by `unwrap`, so the client only exposes success response
 * types — otherwise every call site would have to narrow an `{ error: string }` member out first.
 */
type SuccessApi = PickResponseByStatusCode<ApiType, 200 | 201 | 204>;

// `authFetch` takes the DOM `fetch` signature; the cast bridges Bun's wider `typeof fetch`, which
// leaks in through the workspace's @types/bun.
export const api = hc<SuccessApi>(BACKEND_URL, { fetch: authFetch as typeof fetch });

type JsonResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

/**
 * The body type of a response. Written as a distributive conditional so that a route answering
 * several statuses — the join route returns 200 when rejoining and 201 when joining fresh — yields
 * the union of their bodies rather than failing to infer.
 */
type JsonOf<R> = R extends { json: () => Promise<infer T> } ? T : never;

/** Unwraps a Hono client response, turning an error status into a thrown `Error`. */
export const unwrap = async <R extends JsonResponse>(res: R): Promise<JsonOf<R>> => {
  // `res.ok` narrows the status but not the body, which the signature already pins down.
  if (res.ok) return res.json() as Promise<JsonOf<R>>;

  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as unknown;
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      message = body.error;
    }
  } catch {
    // Keep the status-based message.
  }
  throw new Error(message);
};
