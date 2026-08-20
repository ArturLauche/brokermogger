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

export async function updateBrokerAction(formData: FormData): Promise<void> {
  const actor = await requireRole("MAINTAINER");
  const brokerId = String(formData.get("brokerId") ?? "");
  const verificationStatus = String(
    formData.get("verificationStatus") ?? ""
  ) as BrokerVerificationStatus;
  const sending = formData.get("productionSendingEnabled") === "on";
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
  await retryAdminJob(actor, String(formData.get("jobId") ?? ""));
  redirect("/admin/jobs");
}

export async function cancelJobAction(formData: FormData): Promise<void> {
  const actor = await requireRole("INSTANCE_ADMIN");
  await cancelAdminJob(actor, String(formData.get("jobId") ?? ""));
  redirect("/admin/jobs");
}

export async function grantBreakGlassAction(formData: FormData): Promise<void> {
  const actor = await requireRole("INSTANCE_ADMIN");
  try {
    await grantBreakGlass(actor, {
      targetUserId: String(formData.get("targetUserId") ?? ""),
      justification: String(formData.get("justification") ?? ""),
      durationHours: Number(formData.get("durationHours") ?? 1),
    });
  } catch {
    redirect("/admin/audit?error=grant");
  }
  redirect("/admin/audit");
}

export async function revokeBreakGlassAction(formData: FormData): Promise<void> {
  const actor = await requireRole("INSTANCE_ADMIN");
  await revokeBreakGlass(actor, String(formData.get("grantId") ?? ""));
  redirect("/admin/audit");
}
