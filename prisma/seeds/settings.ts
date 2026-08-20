/**
 * Idempotent writer for the system settings catalogue.
 *
 * A setting is only inserted when it is missing. An existing row is never
 * overwritten, because an instance admin may have changed the value on
 * purpose and the seed must not silently reset it.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import { ALL_SETTINGS } from "@/lib/config/systemSettings";

import { emptyResult, type SeedStepResult } from "./types";

export async function seedSystemSettings(prisma: PrismaClient): Promise<SeedStepResult> {
  const result = emptyResult("System settings");

  const existing = await prisma.systemSetting.findMany({
    where: { key: { in: ALL_SETTINGS.map((setting) => setting.key) } },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((row) => row.key));

  const missing = ALL_SETTINGS.filter((setting) => !existingKeys.has(setting.key));

  for (const setting of missing) {
    await prisma.systemSetting.create({
      data: {
        key: setting.key,
        valueJson: setting.defaultValue as Prisma.InputJsonValue,
        description: setting.description,
        category: setting.category,
        isSensitive: setting.isSensitive ?? false,
      },
    });
    result.created += 1;
  }

  result.skipped = ALL_SETTINGS.length - missing.length;
  if (result.skipped > 0) {
    result.notes.push(`${result.skipped} settings already existed and kept their value`);
  }

  return result;
}
