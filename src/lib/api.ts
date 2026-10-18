/**
 * Tiny JSON client for the app's own API. Errors arrive as `{ error: code, message }` and are
 * thrown as `ApiError` (with the whole body in `data`, e.g. the current note of a 409). A 401
 * means the session is gone (`unauthenticated`) or the passkey step is pending (`mfa_required`):
 * we navigate to the right sign-in step and keep every cache intact, so nothing written offline
 * is lost.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    /** Machine-readable code, e.g. "not_found", "mfa_required". */
    public code: string,
    message: string,
    /** The parsed error body. */
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let redirecting = false;

function goToSignIn(code: string) {
  if (typeof window === "undefined" || redirecting) return;
  const here = window.location.pathname + window.location.search;
  if (here.startsWith("/login")) return;
  redirecting = true;
  const step = code === "mfa_required" ? "/login/verify" : "/login";
  // A full navigation on purpose: this runs outside React (no router here) and the sign-in pages
  // must load fresh. The query cache lives in IndexedDB and survives it.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`${step}?next=${encodeURIComponent(here)}`);
}

/** Browsers cap the bodies of in-flight keepalive requests at 64 KiB in total. */
const KEEPALIVE_MAX_BYTES = 60_000;
/** UTF-8 never takes fewer bytes than UTF-16 code units, so the length check is a cheap early out. */
const fitsKeepalive = (s: string | undefined) => !s || (s.length <= KEEPALIVE_MAX_BYTES && new TextEncoder().encode(s).length <= KEEPALIVE_MAX_BYTES);

export type RequestOptions = {
  /**
   * Let the request outlive the page (a save on pagehide). Ignored for bodies over the keepalive
   * limit — those still go out normally and are replayed from the persisted queue if cut off.
   */
  keepalive?: boolean;
};

async function request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const json = body !== undefined ? JSON.stringify(body) : undefined;
  const res = await fetch(path, {
    method,
    headers: json !== undefined ? { "content-type": "application/json" } : undefined,
    body: json,
    credentials: "same-origin",
    keepalive: !!opts.keepalive && fitsKeepalive(json),
  });
  if (!res.ok) {
    let code = "error";
    let message = res.statusText || `HTTP ${res.status}`;
    let data: unknown;
    try {
      data = await res.json();
      const d = data as { error?: string; message?: string };
      if (d.error) code = d.error;
      message = d.message ?? d.error ?? message;
    } catch {}
    if (res.status === 401) goToSignIn(code === "mfa_required" ? code : "unauthenticated");
    throw new ApiError(res.status, code, message, data);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, body, opts),
  put: <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>("PUT", path, body, opts),
  patch: <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>("PATCH", path, body, opts),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, undefined, opts),
};
