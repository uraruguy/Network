import { describe, expect, it } from "vitest";
import { eachLimit } from "./each-limit";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("eachLimit", () => {
  it("visits every item once with at most `limit` in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];
    const done: number[] = [];
    await eachLimit(
      [5, 1, 4, 2, 3, 1, 2],
      3,
      async (n) => {
        peak = Math.max(peak, ++inFlight);
        await tick(n);
        seen.push(n);
        inFlight--;
      },
      (d) => done.push(d),
    );
    expect(seen.sort()).toEqual([1, 1, 2, 2, 3, 4, 5]);
    expect(peak).toBe(3);
    expect(done).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("handles empty input and limits below one", async () => {
    await expect(eachLimit([], 4, async () => {})).resolves.toBeUndefined();
    const order: number[] = [];
    await eachLimit([1, 2, 3], 0, async (n) => void order.push(n));
    expect(order).toEqual([1, 2, 3]);
  });
});
