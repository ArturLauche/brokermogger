"use server";

import { redirect } from "next/navigation";

import { requireActor } from "@/lib/auth";
import { deleteEvidence, uploadEvidence } from "@/lib/evidence/service";
import type { EvidenceKind } from "@prisma/client";

export async function uploadEvidenceAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/evidence?error=validation");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const requestId = String(formData.get("requestId") ?? "") || null;
  const kind = String(formData.get("kind") ?? "SCREENSHOT") as EvidenceKind;
  try {
    await uploadEvidence(actor, {
      kind,
      requestId,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      body: buffer,
    });
  } catch {
    redirect("/evidence?error=upload");
  }
  redirect("/evidence?stored=1");
}

export async function deleteEvidenceAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await deleteEvidence(actor, String(formData.get("evidenceId") ?? ""));
  redirect("/evidence");
}
