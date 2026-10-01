import { settingCommandSchema } from "./settingCommands";
import { invalidateRuntimeSettingsCache } from "@/lib/config/runtimeSettings";
import { saveAdminSetting } from "@/lib/db/repositories/adminSettings";
import type { ActorContext } from "@/lib/permissions/actor";
import { parseWithSchema } from "@/lib/validation/form";

export async function changeSetting(actor: ActorContext, raw: unknown) {
  const command = parseWithSchema(settingCommandSchema, raw);
  await saveAdminSetting(actor, command);
  invalidateRuntimeSettingsCache();
}
