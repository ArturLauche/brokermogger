import { recordAudit } from "@/lib/audit/service";
import type { AuditAction } from "@/lib/audit/actions";
import { invalidateCatalogCache } from "@/lib/db/repositories/catalog";
import * as repository from "@/lib/db/repositories/adminLegalRules";
import type { ActorContext } from "@/lib/permissions/actor";

async function changed<T extends { legalRuleId: string; versionId?: string }>(
  actor: ActorContext,
  action: AuditAction,
  operation: () => Promise<T>
) {
  const result = await operation();
  invalidateCatalogCache();
  await recordAudit({
    actor,
    action,
    resourceType: result.versionId ? "legal_rule_version" : "legal_rule",
    resourceId: result.versionId ?? result.legalRuleId,
  });
  return result;
}
export const createLegalRule = (actor: ActorContext, raw: unknown) =>
  changed(actor, "admin.legal_rule_created", () =>
    repository.createLegalRuleRecord(actor, raw)
  );
export const updateLegalRule = (actor: ActorContext, raw: unknown) =>
  changed(actor, "admin.legal_rule_updated", () =>
    repository.updateLegalRuleMetadata(actor, raw)
  );
export const startLegalDraft = (actor: ActorContext, raw: unknown) =>
  changed(actor, "admin.legal_rule_draft_saved", () =>
    repository.startLegalRuleDraft(actor, raw)
  );
export const saveLegalDraft = (actor: ActorContext, raw: unknown) =>
  changed(actor, "admin.legal_rule_draft_saved", () =>
    repository.saveLegalRuleDraft(actor, raw)
  );
export const publishLegalRule = (actor: ActorContext, raw: unknown) =>
  changed(actor, "admin.legal_rule_version_published", () =>
    repository.publishLegalRuleVersion(actor, raw)
  );
export const deactivateLegalRule = (actor: ActorContext, raw: unknown) =>
  changed(actor, "admin.legal_rule_deactivated", () =>
    repository.deactivateLegalRuleRecord(actor, raw)
  );
