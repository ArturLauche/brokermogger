"use server";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import {
  createLegalRule,
  updateLegalRule,
  startLegalDraft,
  saveLegalDraft,
  publishLegalRule,
  deactivateLegalRule,
} from "@/lib/admin/legalRules";
import {
  createLegalRuleSchema,
  legalRuleMetadataSchema,
  legalRuleVersionScopeSchema,
  saveLegalDraftSchema,
  publishLegalRuleSchema,
  legalRuleScopeSchema,
} from "@/lib/admin/legalRuleCommands";
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
  ) => Promise<{ legalRuleId: string; versionId?: string }>,
  saved: string
): Promise<State> {
  const actor = await requireActor();
  const values = Object.fromEntries(keys.map((key) => [key, formString(data, key)]));
  let result;
  try {
    result = await operation(actor, values);
  } catch (error) {
    if (!isAppError(error))
      createLogger("admin.legalRules").error(
        { err: error },
        "Legal catalogue command failed"
      );
    return failedAction(error, values);
  }
  const path =
    "/admin/legal-rules/" +
    encodeURIComponent(result.legalRuleId) +
    (result.versionId ? "/versions/" + encodeURIComponent(result.versionId) : "");
  redirect(path + "?saved=" + saved);
}
export async function createLegalRuleAction(_: State, data: FormData) {
  return submit(
    data,
    Object.keys(createLegalRuleSchema.shape),
    createLegalRule,
    "created"
  );
}
export async function updateLegalRuleAction(_: State, data: FormData) {
  return submit(
    data,
    Object.keys(legalRuleMetadataSchema.shape),
    updateLegalRule,
    "details"
  );
}
export async function startLegalDraftAction(_: State, data: FormData) {
  return submit(
    data,
    Object.keys(legalRuleVersionScopeSchema.shape),
    startLegalDraft,
    "created"
  );
}
export async function saveLegalDraftAction(_: State, data: FormData) {
  return submit(data, Object.keys(saveLegalDraftSchema.shape), saveLegalDraft, "draft");
}
export async function publishLegalRuleAction(_: State, data: FormData) {
  return submit(
    data,
    Object.keys(publishLegalRuleSchema.shape),
    publishLegalRule,
    "published"
  );
}
export async function deactivateLegalRuleAction(_: State, data: FormData) {
  return submit(
    data,
    Object.keys(legalRuleScopeSchema.shape),
    deactivateLegalRule,
    "inactive"
  );
}
