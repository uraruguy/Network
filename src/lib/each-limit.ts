/** Runs `fn` over `items` with at most `limit` in flight; `done` is how many have finished, this one included. */
export async function eachLimit<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>, onDone?: (done: number) => void): Promise<void> {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      await fn(items[next++]!);
      onDone?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
}
