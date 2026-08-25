/**
 * Bounded concurrency for independent async work (storage deletes, fan-out).
 * Order of results matches the input order. An error rejects immediately.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      const item = items[current];
      if (item === undefined) continue;
      results[current] = await mapper(item, current);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
