import { recordAudit } from "@/lib/audit/service";
import type { AuditAction } from "@/lib/audit/actions";
import { invalidateCatalogCache } from "@/lib/db/repositories/catalog";
import {
  saveBrokerRecord,
  saveBrokerContact,
  saveBrokerCoverage,
  changeBrokerSending,
} from "@/lib/db/repositories/adminBrokers";
import type { ActorContext } from "@/lib/permissions/actor";
import { brokerCommandSchema } from "./brokerCommands";
import { parseWithSchema } from "@/lib/validation/form";

async function changed(
  actor: ActorContext,
  action: AuditAction,
  operation: () => Promise<{ id: string }>
) {
  const result = await operation();
  invalidateCatalogCache();
  await recordAudit({ actor, action, resourceType: "broker", resourceId: result.id });
  return result;
}
export function saveBroker(actor: ActorContext, raw: unknown) {
  // Parse for the audit action; persistence independently validates its boundary.
  const command = parseWithSchema(brokerCommandSchema, raw);
  return changed(
    actor,
    command.brokerId ? "admin.broker_updated" : "admin.broker_created",
    () => saveBrokerRecord(actor, raw)
  );
}
export function saveContact(actor: ActorContext, raw: unknown) {
  return changed(actor, "admin.broker_updated", () => saveBrokerContact(actor, raw));
}
export function saveCoverage(actor: ActorContext, raw: unknown) {
  return changed(actor, "admin.broker_updated", () => saveBrokerCoverage(actor, raw));
}
export function setBrokerSending(actor: ActorContext, raw: unknown) {
  return changed(actor, "admin.broker_production_sending_changed", () =>
    changeBrokerSending(actor, raw)
  );
}
