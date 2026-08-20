/**
 * S3 compatible storage adapter (AWS S3, MinIO, Garage, ...).
 *
 * Identity documents are encrypted by the application before they reach this
 * adapter. Object metadata must never contain personal data.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";

import { env } from "@/lib/config/env";
import { AppError } from "@/lib/core/errors";

import type {
  PutObjectInput,
  SignedUrlOptions,
  StoragePort,
  StoredObject,
} from "./types";

export class S3StorageAdapter implements StoragePort {
  readonly backend = "s3" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    if (!env.S3_BUCKET) {
      throw new AppError({
        code: "STORAGE_FAILED",
        message: "S3 storage is selected but S3_BUCKET is not configured.",
      });
    }
    this.bucket = env.S3_BUCKET;
    const clientConfig: S3ClientConfig = {
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    };
    if (env.S3_ENDPOINT) {
      clientConfig.endpoint = env.S3_ENDPOINT;
    }
    if (env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
      clientConfig.credentials = {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      };
    }
    this.client = new S3Client(clientConfig);
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          Metadata: input.metadata,
          ServerSideEncryption: "AES256",
        })
      );
    } catch (error) {
      throw new AppError({
        code: "STORAGE_FAILED",
        message: "The file could not be stored.",
        cause: error,
      });
    }

    return {
      key: input.key,
      byteSize: input.body.byteLength,
      contentType: input.contentType,
      checksumSha256: createHash("sha256").update(input.body).digest("hex"),
      serverSideEncrypted: true,
    };
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key })
      );
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) {
        throw new Error("empty body");
      }
      return Buffer.from(bytes);
    } catch (error) {
      throw new AppError({
        code: "STORAGE_FAILED",
        message: "The file could not be read.",
        cause: error,
      });
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async signedDownloadUrl(key: string, options: SignedUrlOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(options.downloadFilename
        ? {
            ResponseContentDisposition: `attachment; filename="${options.downloadFilename.replace(/"/g, "")}"`,
          }
        : {}),
    });
    return getSignedUrl(this.client, command, { expiresIn: options.expiresInSeconds });
  }
}
