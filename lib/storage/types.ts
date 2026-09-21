/**
 * Object storage contract for evidence files and temporary sensitive uploads.
 *
 * Implementations: LocalStorageAdapter (filesystem, development),
 * S3StorageAdapter (S3 compatible, MinIO in the dev stack) and
 * MemoryStorageAdapter (tests).
 *
 * All private files are encrypted by the application before they reach the
 * adapter. Object URLs cannot bypass application authentication/decryption.
 */

export interface StoredObject {
  key: string;
  byteSize: number;
  contentType: string;
  checksumSha256: string;
  serverSideEncrypted: boolean;
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  /** Object metadata. Must not contain personal data. */
  metadata?: Record<string, string>;
  /** Retention hint for lifecycle policies. */
  temporary?: boolean;
}

export interface SignedUrlOptions {
  expiresInSeconds: number;
  /** Filename offered to the browser. Already sanitised by the caller. */
  downloadFilename?: string;
}

export interface StoragePort {
  readonly backend: "local" | "s3" | "memory";
  put(input: PutObjectInput): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /**
   * Time limited download URL. The local and memory adapters return an
   * application route that performs its own authorization check.
   */
  signedDownloadUrl(key: string, options: SignedUrlOptions): Promise<string>;
}
