/**
 * An error with an HTTP status and a machine-readable code. Data functions may throw it for
 * domain failures (unknown person, conflicting id …); route handlers (`withOwner`) turn it into
 * `{ error: code, message }` with that status.
 */
const DEFAULT_CODES: Record<number, string> = {
  400: "bad_request",
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  410: "gone",
  422: "invalid",
  429: "rate_limited",
  500: "internal",
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = DEFAULT_CODES[status] ?? "error",
  ) {
    super(message);
    this.name = "HttpError";
  }
}
