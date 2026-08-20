/**
 * In-memory storage adapter used by tests.
 *
 * Nothing is written to disk. The map is process-local and reset between tests
 * via `clearMemoryStorage()`.
 */
import { createHash } from "node:crypto";

import { AppError } from "@/lib/core/errors";

import type {
  PutObjectInput,
  SignedUrlOptions,
  StoragePort,
  StoredObject,
} from "./types";

const store = new Map<
  string,
  { body: Buffer; contentType: string; temporary: boolean }
>();

function checksum(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

export class MemoryStorageAdapter implements StoragePort {
  readonly backend = "memory" as const;

  async put(input: PutObjectInput): Promise<StoredObject> {
    store.set(input.key, {
      body: Buffer.from(input.body),
      contentType: input.contentType,
      temporary: Boolean(input.temporary),
    });
    return {
      key: input.key,
      byteSize: input.body.byteLength,
      contentType: input.contentType,
      checksumSha256: checksum(input.body),
      serverSideEncrypted: false,
    };
  }

  async get(key: string): Promise<Buffer> {
    const row = store.get(key);
    if (!row) {
      throw new AppError({
        code: "STORAGE_FAILED",
        message: "Object not found.",
        details: { key },
      });
    }
    return Buffer.from(row.body);
  }

  async exists(key: string): Promise<boolean> {
    return store.has(key);
  }

  async delete(key: string): Promise<void> {
    store.delete(key);
  }

  async signedDownloadUrl(key: string, options: SignedUrlOptions): Promise<string> {
    const filename = options.downloadFilename ?? key;
    return `/api/evidence/download?key=${encodeURIComponent(key)}&filename=${encodeURIComponent(filename)}`;
  }
}

export function clearMemoryStorage(): void {
  store.clear();
}
