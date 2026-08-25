/**
 * Small in-process TTL caches.
 *
 * Used for read-mostly catalogue data (jurisdictions, published legal rules,
 * broker directory) and instance settings so a typical page does not re-query
 * the same rows on every request. Entries expire, the map is bounded, and
 * callers must invalidate on writes.
 *
 * `getOrLoad` coalesces concurrent misses onto one loader so a cache expiry
 * cannot stampede Postgres. This is not a substitute for authorization:
 * cached values are public catalogue records or instance settings, never
 * user data.
 */

export interface TtlCache<T> {
  get(): T | undefined;
  set(value: T): void;
  clear(): void;
  getOrLoad(loader: () => Promise<T>): Promise<T>;
}

export function createTtlCache<T>(ttlMs: number): TtlCache<T> {
  let entry: { at: number; value: T } | null = null;
  let inflight: Promise<T> | null = null;
  let generation = 0;

  function read(): T | undefined {
    if (!entry) return undefined;
    if (Date.now() - entry.at >= ttlMs) {
      entry = null;
      return undefined;
    }
    return entry.value;
  }

  return {
    get: read,
    set(value) {
      entry = { at: Date.now(), value };
    },
    clear() {
      generation += 1;
      entry = null;
      inflight = null;
    },
    getOrLoad(loader) {
      const cached = read();
      if (cached !== undefined) return Promise.resolve(cached);
      if (inflight) return inflight;

      const gen = generation;
      const pending = loader()
        .then((value) => {
          if (gen === generation) {
            entry = { at: Date.now(), value };
          }
          return value;
        })
        .finally(() => {
          if (inflight === pending) inflight = null;
        });
      inflight = pending;
      return pending;
    },
  };
}

interface KeyedEntry<T> {
  at: number;
  value: T;
}

export interface KeyedTtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  clear(): void;
  size(): number;
  getOrLoad(key: string, loader: () => Promise<T>): Promise<T>;
}

/**
 * Bounded key/value TTL cache. Oldest keys are dropped when `maxEntries` is
 * exceeded so a unique-filter flood cannot grow the process without limit.
 */
export function createKeyedTtlCache<T>(
  ttlMs: number,
  maxEntries: number
): KeyedTtlCache<T> {
  const entries = new Map<string, KeyedEntry<T>>();
  const inflight = new Map<string, Promise<T>>();
  let generation = 0;

  function read(key: string): T | undefined {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at >= ttlMs) {
      entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function write(key: string, value: T): void {
    if (entries.has(key)) {
      entries.delete(key);
    }
    entries.set(key, { at: Date.now(), value });
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  return {
    get: read,
    set: write,
    clear() {
      generation += 1;
      entries.clear();
      inflight.clear();
    },
    size() {
      return entries.size;
    },
    getOrLoad(key, loader) {
      const cached = read(key);
      if (cached !== undefined) return Promise.resolve(cached);
      const existing = inflight.get(key);
      if (existing) return existing;

      const gen = generation;
      const pending = loader()
        .then((value) => {
          if (gen === generation) write(key, value);
          return value;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, pending);
      return pending;
    },
  };
}
