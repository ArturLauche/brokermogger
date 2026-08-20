/**
 * Filesystem storage adapter for local development.
 *
 * Objects live under `STORAGE_LOCAL_DIR`. Keys are sanitised so that `../`
 * cannot escape the root. This adapter is not used in production.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/config/env";
import { AppError } from "@/lib/core/errors";

import type {
  PutObjectInput,
  SignedUrlOptions,
  StoragePort,
  StoredObject,
} from "./types";

function resolveKey(root: string, key: string): string {
  const normalised = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalised.includes("..") || path.isAbsolute(normalised)) {
    throw new AppError({
      code: "STORAGE_FAILED",
      message: "Object key is not allowed.",
    });
  }
  const resolved = path.resolve(root, normalised);
  if (!resolved.startsWith(path.resolve(root))) {
    throw new AppError({
      code: "STORAGE_FAILED",
      message: "Object key is not allowed.",
    });
  }
  return resolved;
}

export class LocalStorageAdapter implements StoragePort {
  readonly backend = "local" as const;

  constructor(private readonly root = env.STORAGE_LOCAL_DIR) {}

  async put(input: PutObjectInput): Promise<StoredObject> {
    const filePath = resolveKey(this.root, input.key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body);
    return {
      key: input.key,
      byteSize: input.body.byteLength,
      contentType: input.contentType,
      checksumSha256: createHash("sha256").update(input.body).digest("hex"),
      serverSideEncrypted: false,
    };
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(resolveKey(this.root, key));
    } catch {
      throw new AppError({ code: "STORAGE_FAILED", message: "Object not found." });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(resolveKey(this.root, key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(resolveKey(this.root, key), { force: true });
  }

  async signedDownloadUrl(key: string, options: SignedUrlOptions): Promise<string> {
    const filename = options.downloadFilename ?? key;
    return `/api/evidence/download?key=${encodeURIComponent(key)}&filename=${encodeURIComponent(filename)}`;
  }
}
