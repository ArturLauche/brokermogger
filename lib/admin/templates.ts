import { recordAudit } from "@/lib/audit/service";
import type { AuditAction } from "@/lib/audit/actions";
import { invalidateCatalogCache } from "@/lib/db/repositories/catalog";
import * as repository from "@/lib/db/repositories/adminTemplates";
import type { ActorContext } from "@/lib/permissions/actor";

async function changed<T extends { templateId: string; versionId?: string }>(
  actor: ActorContext,
  action: AuditAction,
  operation: () => Promise<T>
) {
  const result = await operation();
  invalidateCatalogCache();
  await recordAudit({
    actor,
    action,
    resourceType: result.versionId ? "request_template_version" : "request_template",
    resourceId: result.versionId ?? result.templateId,
  });
  return result;
}
export const createTemplate = (actor: ActorContext, raw: unknown) =>
  changed(actor, "admin.template_created", () =>
    repository.createTemplateRecord(actor, raw)
  );
export const updateTemplate = (actor: ActorContext, raw: unknown) =>
  changed(actor, "admin.template_updated", () =>
    repository.updateTemplateMetadata(actor, raw)
  );
export const startDraft = (actor: ActorContext, raw: unknown) =>
  changed(actor, "admin.template_draft_saved", () =>
    repository.startTemplateDraft(actor, raw)
  );
export const saveDraft = (actor: ActorContext, raw: unknown) =>
  changed(actor, "admin.template_draft_saved", () =>
    repository.saveTemplateDraft(actor, raw)
  );
export const publishTemplate = (actor: ActorContext, raw: unknown) =>
  changed(actor, "admin.template_version_published", () =>
    repository.publishTemplateVersion(actor, raw)
  );
export const deactivate = (actor: ActorContext, raw: unknown) =>
  changed(actor, "admin.template_deactivated", () =>
    repository.deactivateTemplate(actor, raw)
  );
