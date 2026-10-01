"use server";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import {
  createTemplate,
  updateTemplate,
  startDraft,
  saveDraft,
  publishTemplate,
  deactivate,
} from "@/lib/admin/templates";
import {
  createTemplateSchema,
  templateMetadataSchema,
  templateVersionScopeSchema,
  saveTemplateDraftSchema,
  publishTemplateSchema,
  templateScopeSchema,
} from "@/lib/admin/templateCommands";
import type { ActorContext } from "@/lib/permissions/actor";
import { type ActionState, failedAction } from "@/lib/validation/actionResult";
import { formString } from "@/lib/validation/form";
import { isAppError } from "@/lib/core/errors";
import { createLogger } from "@/lib/observability/logger";

type State = ActionState<Record<string, string>>;
async function submit(
  data: FormData,
  keys: string[],
  operation: (
    actor: ActorContext,
    raw: unknown
  ) => Promise<{ templateId: string; versionId?: string }>,
  saved: string
): Promise<State> {
  const actor = await requireActor();
  const values = Object.fromEntries(keys.map((key) => [key, formString(data, key)]));
  let result;
  try {
    result = await operation(actor, values);
  } catch (error) {
    if (!isAppError(error))
      createLogger("admin.templates").error({ err: error }, "Template command failed");
    return failedAction(error, values);
  }
  const path = `/admin/templates/${encodeURIComponent(result.templateId)}${result.versionId ? `/versions/${encodeURIComponent(result.versionId)}` : ""}`;
  redirect(`${path}?saved=${saved}`);
}
export async function createTemplateAction(_: State, data: FormData) {
  return submit(data, Object.keys(createTemplateSchema.shape), createTemplate, "created");
}
export async function updateTemplateAction(_: State, data: FormData) {
  return submit(
    data,
    Object.keys(templateMetadataSchema.shape),
    updateTemplate,
    "details"
  );
}
export async function startDraftAction(_: State, data: FormData) {
  return submit(
    data,
    Object.keys(templateVersionScopeSchema.shape),
    startDraft,
    "created"
  );
}
export async function saveDraftAction(_: State, data: FormData) {
  return submit(data, Object.keys(saveTemplateDraftSchema.shape), saveDraft, "draft");
}
export async function publishTemplateAction(_: State, data: FormData) {
  return submit(
    data,
    Object.keys(publishTemplateSchema.shape),
    publishTemplate,
    "published"
  );
}
export async function deactivateTemplateAction(_: State, data: FormData) {
  return submit(data, Object.keys(templateScopeSchema.shape), deactivate, "inactive");
}
