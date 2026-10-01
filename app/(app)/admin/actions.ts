"use server";

import { redirect } from "next/navigation";

import {
  cancelAdminJob,
  grantBreakGlass,
  retryAdminJob,
  revokeBreakGlass,
  requestAdminAuditVerification,
} from "@/lib/admin/service";
import { requireRole } from "@/lib/auth";
import { formString, parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { z } from "zod";

export async function retryJobAction(formData: FormData): Promise<void> {
  const actor = await requireRole("INSTANCE_ADMIN");
  try {
    await retryAdminJob(
      actor,
      parseWithSchema(entityIdSchema, formString(formData, "jobId"))
    );
  } catch {
    redirect("/admin/jobs?error=retry");
  }
  redirect("/admin/jobs");
}

export async function requestAuditCheckAction(formData: FormData): Promise<void> {
  const actor = await requireRole("INSTANCE_ADMIN");
  try {
    const input = parseWithSchema(
      z.object({}).strict(),
      Object.fromEntries(
        [...formData.entries()].filter(([key]) => !key.startsWith("$ACTION_"))
      )
    );
    await requestAdminAuditVerification(actor, input);
  } catch {
    redirect("/admin/audit?error=verification");
  }
  redirect("/admin/audit?check=requested");
}

export async function cancelJobAction(formData: FormData): Promise<void> {
  const actor = await requireRole("INSTANCE_ADMIN");
  try {
    await cancelAdminJob(
      actor,
      parseWithSchema(entityIdSchema, formString(formData, "jobId"))
    );
  } catch {
    redirect("/admin/jobs?error=cancel");
  }
  redirect("/admin/jobs");
}

export async function grantBreakGlassAction(formData: FormData): Promise<void> {
  const actor = await requireRole("INSTANCE_ADMIN");
  try {
    const input = parseWithSchema(
      z.object({
        targetUserId: entityIdSchema,
        justification: z.string().trim().min(20).max(2000),
        durationHours: z.coerce.number().int().min(1).max(24),
      }),
      {
        targetUserId: formString(formData, "targetUserId"),
        justification: formString(formData, "justification"),
        durationHours: formString(formData, "durationHours") || "1",
      }
    );
    await grantBreakGlass(actor, input);
  } catch {
    redirect("/admin/audit?error=grant");
  }
  redirect("/admin/audit");
}

export async function revokeBreakGlassAction(formData: FormData): Promise<void> {
  const actor = await requireRole("INSTANCE_ADMIN");
  try {
    await revokeBreakGlass(
      actor,
      parseWithSchema(entityIdSchema, formString(formData, "grantId"))
    );
  } catch {
    redirect("/admin/audit?error=revoke");
  }
  redirect("/admin/audit");
}
