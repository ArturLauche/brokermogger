import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { parseWithSchema } from "@/lib/validation/form";

export const WORKER_HEARTBEAT_INTERVAL_MS = 15_000;
export const WORKER_HEARTBEAT_MAX_AGE_MS = 60_000;
export const workerIdSchema = z.string().regex(/^worker-[a-f0-9-]{36}$/);

/** Process identities are random, carry no hostname and confer no user permissions. */
export async function registerWorker(raw: unknown) {
  const id = parseWithSchema(workerIdSchema, raw);
  await prisma.workerHeartbeat.deleteMany({
    where: { lastSeenAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
  });
  await prisma.workerHeartbeat.create({ data: { id } });
}
export async function refreshWorkerHeartbeat(raw: unknown) {
  const id = parseWithSchema(workerIdSchema, raw);
  const { count } = await prisma.workerHeartbeat.updateMany({
    where: { id, stoppedAt: null },
    data: { lastSeenAt: new Date() },
  });
  return count === 1;
}
export async function stopWorkerHeartbeat(raw: unknown) {
  const id = parseWithSchema(workerIdSchema, raw);
  await prisma.workerHeartbeat.updateMany({
    where: { id, stoppedAt: null },
    data: { stoppedAt: new Date() },
  });
}
export async function isWorkerHealthy(raw: unknown) {
  const id = parseWithSchema(workerIdSchema, raw);
  return (
    (await prisma.workerHeartbeat.count({
      where: {
        id,
        stoppedAt: null,
        lastSeenAt: { gte: new Date(Date.now() - WORKER_HEARTBEAT_MAX_AGE_MS) },
      },
    })) === 1
  );
}
