"use server";

import { redirect } from "next/navigation";

import {
  cancelAdminJob,
  changeBrokerProductionSending,
  changeBrokerVerification,
  grantBreakGlass,
  retryAdminJob,
  revokeBreakGlass,
} from "@/lib/admin/service";
import { requireRole } from "@/lib/auth";
import type { BrokerVerificationStatus } from "@prisma/client";
import { brokerVerificationStatusSchema } from "@/lib/validation/enums";
import { formCheckbox, formString, parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { z } from "zod";

export async function updateBrokerAction(formData: FormData): Promise<void> {
  const actor = await requireRole("MAINTAINER");
  let brokerId: string;
  let verificationStatus: BrokerVerificationStatus;
  let sending: boolean;
  try {
    brokerId = parseWithSchema(entityIdSchema, formString(formData, "brokerId"));
    verificationStatus = parseWithSchema(
      brokerVerificationStatusSchema,
      formString(formData, "verificationStatus")
    );
    sending = formCheckbox(formData, "productionSendingEnabled");
  } catch {
    redirect("/admin/brokers?error=validation");
  }
  await changeBrokerVerification(actor, brokerId, verificationStatus);
  try {
    await changeBrokerProductionSending(actor, brokerId, sending);
  } catch {
    redirect("/admin/brokers?error=sending");
  }
  redirect("/admin/brokers");
}

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
