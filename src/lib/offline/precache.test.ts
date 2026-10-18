import type { SerwistPlugin } from "serwist";
import { describe, expect, it } from "vitest";
import { directResponsesOnly, isPrecacheable } from "./precache";

/** A Response as the install's fetch returns it; `redirected` is read-only on constructed ones. */
function fetched(status: number, redirected = false) {
  const response = new Response(status === 204 ? null : "<html></html>", { status });
  Object.defineProperty(response, "redirected", { value: redirected });
  return response;
}

const cacheWillUpdate = (response: Response) =>
  directResponsesOnly.cacheWillUpdate!({ response } as Parameters<NonNullable<SerwistPlugin["cacheWillUpdate"]>>[0]);

describe("isPrecacheable", () => {
  it("accepts direct 2xx answers", () => {
    expect(isPrecacheable(fetched(200))).toBe(true);
    expect(isPrecacheable(fetched(204))).toBe(true);
  });

  it("rejects a page that redirected, even when the target answered 200 (signed out: /today → /login)", () => {
    expect(isPrecacheable(fetched(200, true))).toBe(false);
  });

  it("rejects error statuses (Serwist's own < 400 check is skipped once a plugin defines cacheWillUpdate)", () => {
    expect(isPrecacheable(fetched(404))).toBe(false);
    expect(isPrecacheable(fetched(500))).toBe(false);
  });
});

describe("directResponsesOnly", () => {
  it("passes a direct response through unchanged", async () => {
    const response = fetched(200);
    expect(await cacheWillUpdate(response)).toBe(response);
  });

  it("returns null for a redirected or failed response, which fails the install", async () => {
    expect(await cacheWillUpdate(fetched(200, true))).toBeNull();
    expect(await cacheWillUpdate(fetched(404))).toBeNull();
  });
});
