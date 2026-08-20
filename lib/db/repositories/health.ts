/**
 * Cheap database liveness probe for `/api/health`.
 *
 * Deliberately the smallest possible query: no table is touched, no
 * configuration is returned, and the caller only learns whether the connection
 * works.
 */
import { prisma } from "@/lib/db/client";

export async function checkDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
