import { ALL_SETTINGS, findSetting } from "@/lib/config/systemSettings";
import { parseSettingValue, settingCommandSchema } from "@/lib/admin/settingCommands";
import { AppError, ValidationError } from "@/lib/core/errors";
import { prisma } from "@/lib/db/client";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { parseWithSchema } from "@/lib/validation/form";
import { lockActiveAccount } from "./access";

export async function listAdminSettings(actor: ActorContext) {
  requirePermission(actor, "admin:settings:read");
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ALL_SETTINGS.filter((s) => !s.isSensitive).map((s) => s.key) } },
    select: { key: true, valueJson: true, updatedAt: true, isSensitive: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return ALL_SETTINGS.filter((s) => !s.isSensitive && !byKey.get(s.key)?.isSensitive).map(
    (definition) => {
      const row = byKey.get(definition.key);
      const parsed = definition.schema.safeParse(row?.valueJson);
      return {
        key: definition.key,
        category: definition.category,
        description: definition.description,
        type: typeof definition.defaultValue,
        defaultValue: String(definition.defaultValue),
        value: String(parsed.success ? parsed.data : definition.defaultValue),
        updatedAt: row?.updatedAt.toISOString() ?? "",
        invalid: !!row && !parsed.success,
      };
    }
  );
}

export async function saveAdminSetting(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:settings:manage");
  const command = parseWithSchema(settingCommandSchema, raw);
  const definition = findSetting(command.key);
  if (!definition || definition.isSensitive)
    throw new ValidationError("This setting cannot be edited here.");
  const value =
    command.intent === "reset"
      ? (definition.defaultValue as string | number | boolean)
      : parseSettingValue(command.key, command.value);
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, actor.userId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`setting:${command.key}`}, 0))`;
    const current = await tx.systemSetting.findUnique({
      where: { key: command.key },
      select: { updatedAt: true, isSensitive: true },
    });
    if (current?.isSensitive)
      throw new ValidationError("This setting cannot be edited here.");
    if ((current?.updatedAt.toISOString() ?? "") !== command.expectedUpdatedAt)
      throw new AppError({
        code: "CONFLICT",
        message:
          "This setting changed in another session. Reload to review the current value before saving.",
      });
    return tx.systemSetting.upsert({
      where: { key: command.key },
      create: {
        key: command.key,
        valueJson: value,
        category: definition.category,
        description: definition.description,
        isSensitive: false,
        updatedByUserId: actor.userId,
      },
      update: {
        valueJson: value,
        updatedByUserId: actor.userId,
        updatedAt: new Date(
          Math.max(Date.now(), (current?.updatedAt.getTime() ?? 0) + 1)
        ),
      },
      select: { updatedAt: true },
    });
  });
}
