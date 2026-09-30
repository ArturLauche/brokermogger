"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActor } from "@/lib/auth";
import { deleteEvidence, uploadEvidence } from "@/lib/evidence/service";
import { formString, parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema, optionalEntityIdSchema } from "@/lib/validation/ids";
import {
  evidenceUploadKindSchema,
  validateEvidenceFile,
  validateUploadSize,
} from "@/lib/evidence/files";
import { ValidationError, isAppError } from "@/lib/core/errors";
import { failedAction, type ActionState } from "@/lib/validation/actionResult";

export type EvidenceUploadFields = {
  kind: string;
  requestId: string;
  identityConsent: string;
  file: string;
};
const uploadSchema = z.object({
  kind: evidenceUploadKindSchema,
  requestId: optionalEntityIdSchema,
});

export async function uploadEvidenceAction(
  _previous: ActionState<EvidenceUploadFields>,
  formData: FormData
): Promise<ActionState<EvidenceUploadFields>> {
  const actor = await requireActor();
  const values = {
    kind: formString(formData, "kind") || "SCREENSHOT",
    requestId: formString(formData, "requestId"),
    identityConsent: formData.get("identityConsent") === "on" ? "true" : "false",
    file: "",
  };
  try {
    const { kind, requestId } = parseWithSchema(uploadSchema, values);
    const file = formData.get("file");
    let buffer: Buffer;
    try {
      if (!(file instanceof File)) throw new ValidationError("Choose a file.");
      validateUploadSize(file.size);
      buffer = Buffer.from(await file.arrayBuffer());
      validateEvidenceFile(buffer, file.type);
    } catch (error) {
      if (isAppError(error) && error.code === "VALIDATION_FAILED")
        throw new ValidationError(error.message, {
          fieldErrors: { file: error.message },
        });
      throw error;
    }
    if (!(file instanceof File)) throw new ValidationError("Choose a file.");
    await uploadEvidence(actor, {
      kind,
      requestId,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      body: buffer,
      identityConsent: values.identityConsent === "true",
    });
  } catch (error) {
    return failedAction(error, values);
  }
  revalidatePath("/evidence");
  redirect("/evidence?stored=1");
}

export async function deleteEvidenceAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  try {
    await deleteEvidence(
      actor,
      parseWithSchema(entityIdSchema, formString(formData, "evidenceId"))
    );
  } catch (error) {
    if (isAppError(error)) redirect(`/evidence?error=delete&code=${error.code}`);
    throw error;
  }
  redirect("/evidence");
}
