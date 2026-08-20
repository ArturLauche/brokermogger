/**
 * Storage factory.
 *
 * Selection follows `STORAGE_BACKEND`. Tests force `memory` through the env
 * defaults in `tests/setup/test-env.ts`.
 */
import { env } from "@/lib/config/env";

import { LocalStorageAdapter } from "./local";
import { MemoryStorageAdapter } from "./memory";
import { S3StorageAdapter } from "./s3";
import type { StoragePort } from "./types";

let cached: StoragePort | undefined;

export function getStorage(): StoragePort {
  if (!cached) {
    cached = createStorage();
  }
  return cached;
}

function createStorage(): StoragePort {
  switch (env.STORAGE_BACKEND) {
    case "s3":
      return new S3StorageAdapter();
    case "memory":
      return new MemoryStorageAdapter();
    case "local":
      return new LocalStorageAdapter();
    default: {
      const exhaustive: never = env.STORAGE_BACKEND;
      throw new Error(`Unsupported STORAGE_BACKEND: ${String(exhaustive)}`);
    }
  }
}

export function setStorageForTests(storage?: StoragePort): void {
  cached = storage;
}

export type { StoragePort, StoredObject, PutObjectInput } from "./types";
export { MemoryStorageAdapter, clearMemoryStorage } from "./memory";
export { LocalStorageAdapter } from "./local";
export { S3StorageAdapter } from "./s3";
