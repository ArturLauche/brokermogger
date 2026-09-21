"use server";

import { redirect } from "next/navigation";

import { requireActor } from "@/lib/auth";
import { deleteEvidence, uploadEvidence } from "@/lib/evidence/service";
import { evidenceKindSchema } from "@/lib/validation/enums";
import { formString, parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema, optionalEntityIdSchema } from "@/lib/validation/ids";
import { MAX_EVIDENCE_BYTES } from "@/lib/evidence/files";

export async function uploadEvidenceAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_EVIDENCE_BYTES) {
    redirect("/evidence?error=validation");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const requestId = parseWithSchema(
      optionalEntityIdSchema,
      formString(formData, "requestId")
    );
    const kind = parseWithSchema(
      evidenceKindSchema,
      formString(formData, "kind") || "SCREENSHOT"
    );
    await uploadEvidence(actor, {
      kind,
      requestId,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      body: buffer,
      identityConsent: formData.get("identityConsent") === "on",
    });
  } catch {
    redirect("/evidence?error=upload");
  }
  redirect("/evidence?stored=1");
}

export async function deleteEvidenceAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  try {
    await deleteEvidence(
      actor,
      parseWithSchema(entityIdSchema, formString(formData, "evidenceId"))
    );
  } catch {
    redirect("/evidence?error=delete");
  }
  redirect("/evidence");
}
