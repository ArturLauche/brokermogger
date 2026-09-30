import "dotenv/config";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config/env";
import { isWorkerHealthy } from "@/lib/db/repositories/workers";

async function main() {
  if (!env.WORKER_HEALTH_FILE) return false;
  const id = await readFile(env.WORKER_HEALTH_FILE, "utf8");
  return isWorkerHealthy(id.trim());
}
main()
  .then((healthy) => {
    process.exitCode = healthy ? 0 : 1;
  })
  .catch(() => {
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
