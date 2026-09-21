/**
 * Storage factory.
 *
 * Selection follows `STORAGE_BACKEND`. Tests force `memory` through the env
 * defaults in `tests/setup/test-env.ts`.
 */
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/core/errors";

import { LocalStorageAdapter } from "./local";
import { MemoryStorageAdapter } from "./memory";
import { S3StorageAdapter } from "./s3";
import type { StoragePort } from "./types";

const cached = new Map<string, StoragePort>();

export function getStorage(backend: string = env.STORAGE_BACKEND): StoragePort {
  const existing = cached.get(backend);
  if (existing) return existing;
  const storage = createStorage(backend);
  cached.set(backend, storage);
  return storage;
}

function createStorage(backend: string): StoragePort {
  switch (backend) {
    case "s3":
      return new S3StorageAdapter();
    case "memory":
      return new MemoryStorageAdapter();
    case "local":
      return new LocalStorageAdapter();
    default: {
      throw new AppError({
        code: "STORAGE_FAILED",
        message: "This file uses a storage backend that is not configured.",
      });
    }
  }
}

export function setStorageForTests(storage?: StoragePort): void {
  cached.clear();
  if (storage) cached.set(storage.backend, storage);
}

export type { StoragePort, StoredObject, PutObjectInput } from "./types";
export { MemoryStorageAdapter, clearMemoryStorage } from "./memory";
export { LocalStorageAdapter } from "./local";
export { S3StorageAdapter } from "./s3";
