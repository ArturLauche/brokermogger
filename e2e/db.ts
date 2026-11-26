/**
 * Prisma client for browser end-to-end tests.
 *
 * Prisma 7 requires an explicit driver adapter, so every spec that took a bare
 * `new PrismaClient()` now goes through this module. The subclass keeps the
 * existing `PrismaClient` type/value usage in the specs unchanged.
 *
 * DATABASE_URL must point at the dedicated browser schema. `e2e/helpers.ts`
 * still refuses to mutate anything outside an isolated local database.
 */
import { PrismaClient as GeneratedPrismaClient } from "@prisma/client";

import { createPrismaClientOptions } from "@/lib/db/createPrismaClient";

export class PrismaClient extends GeneratedPrismaClient {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString)
      throw new Error("DATABASE_URL is required for end-to-end tests.");
    super(createPrismaClientOptions(connectionString));
  }
}
