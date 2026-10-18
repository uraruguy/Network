import { describe, expect, it } from "vitest";
import { serviceWorkerEnabled } from "./sw-dev";

describe("serviceWorkerEnabled", () => {
  it("is on in production builds and tests", () => {
    expect(serviceWorkerEnabled({ NODE_ENV: "production" })).toBe(true);
    expect(serviceWorkerEnabled({ NODE_ENV: "test" })).toBe(true);
  });

  it("is off in next dev unless NEXT_PUBLIC_SW_DEV=1", () => {
    expect(serviceWorkerEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(serviceWorkerEnabled({ NODE_ENV: "development", NEXT_PUBLIC_SW_DEV: "0" })).toBe(false);
    expect(serviceWorkerEnabled({ NODE_ENV: "development", NEXT_PUBLIC_SW_DEV: "1" })).toBe(true);
  });
});
