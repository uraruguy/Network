/**
 * Tiny JSON client for the app's own API. Errors arrive as `{ error: code, message }` and are
 * thrown as `ApiError`. A 401 means the session is gone (`unauthenticated`) or the passkey step is
 * pending (`mfa_required`): we navigate to the right sign-in step and keep every cache intact, so
 * nothing written offline is lost.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    /** Machine-readable code, e.g. "not_found", "mfa_required". */
    public code: string,
    message: string,
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
  window.location.assign(`${step}?next=${encodeURIComponent(here)}`);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  if (!res.ok) {
    let code = "error";
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      if (data.error) code = data.error;
      message = data.message ?? data.error ?? message;
    } catch {}
    if (res.status === 401) goToSignIn(code === "mfa_required" ? code : "unauthenticated");
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
