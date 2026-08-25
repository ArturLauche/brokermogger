/**
 * Runtime instance settings loaded from `SystemSetting` with a short TTL.
 *
 * The catalogue in `systemSettings.ts` is the schema and the default. Admin
 * changes in the database take effect without a process restart. Missing or
 * invalid rows fall back to the compiled default so a corrupt JSON value cannot
 * take the instance down.
 */
import { createTtlCache } from "@/lib/cache/ttl";
import { getUserQuotaRow, listSystemSettingRows } from "@/lib/db/repositories/settings";

import { ALL_SETTINGS, SETTINGS } from "./systemSettings";

const CACHE_TTL_MS = 15_000;
const cache = createTtlCache<Map<string, unknown>>(CACHE_TTL_MS);

export type RuntimeSettingName = keyof typeof SETTINGS;

export type RuntimeSettingValue<K extends RuntimeSettingName> =
  (typeof SETTINGS)[K]["defaultValue"];

export interface EffectiveFairUse {
  requestsPerDay: number;
  requestsPerMonth: number;
  requestsPerBrokerPer30Days: number;
}

async function loadSettingMap(): Promise<Map<string, unknown>> {
  return cache.getOrLoad(async () => {
    const rows = await listSystemSettingRows();
    const byKey = new Map(rows.map((row) => [row.key, row.valueJson]));
    const values = new Map<string, unknown>();

    for (const definition of ALL_SETTINGS) {
      const raw = byKey.get(definition.key);
      if (raw === undefined) {
        values.set(definition.key, definition.defaultValue);
        continue;
      }
      const parsed = definition.schema.safeParse(raw);
      values.set(definition.key, parsed.success ? parsed.data : definition.defaultValue);
    }

    return values;
  });
}

export async function getSetting<K extends RuntimeSettingName>(
  name: K
): Promise<RuntimeSettingValue<K>> {
  const values = await loadSettingMap();
  const definition = SETTINGS[name];
  return (
    (values.get(definition.key) as RuntimeSettingValue<K>) ?? definition.defaultValue
  );
}

export async function getEffectiveFairUse(userId: string): Promise<EffectiveFairUse> {
  const [requestsPerDay, requestsPerMonth, requestsPerBrokerPer30Days, quota] =
    await Promise.all([
      getSetting("fairUseRequestsPerDay"),
      getSetting("fairUseRequestsPerMonth"),
      getSetting("fairUseRequestsPerBrokerPer30Days"),
      getUserQuotaRow(userId),
    ]);

  return {
    requestsPerDay: quota?.requestsPerDay ?? requestsPerDay,
    requestsPerMonth: quota?.requestsPerMonth ?? requestsPerMonth,
    requestsPerBrokerPer30Days:
      quota?.requestsPerBrokerPer30Days ?? requestsPerBrokerPer30Days,
  };
}

export async function getPublicInstanceLinks(): Promise<{
  repositoryUrl: string;
  documentationUrl: string;
  displayName: string;
}> {
  const [repositoryUrl, documentationUrl, displayName] = await Promise.all([
    getSetting("instanceRepositoryUrl"),
    getSetting("instanceDocumentationUrl"),
    getSetting("instanceDisplayName"),
  ]);
  return { repositoryUrl, documentationUrl, displayName };
}

export function invalidateRuntimeSettingsCache(): void {
  cache.clear();
}

/** Test helper. Never call this from application code. */
export function resetRuntimeSettingsCacheForTests(): void {
  invalidateRuntimeSettingsCache();
}
