/**
 * Admin console helpers.
 */
import { addHours } from "date-fns";

import { recordAudit, verifyAuditChain } from "@/lib/audit/service";
import { ValidationError } from "@/lib/core/errors";
import {
  countAdminOverview,
  createAdminAction,
  listActiveBreakGlassGrants,
  listAdminAudit,
  listAdminBrokers,
  listAdminJobs,
  listAdminLegalRules,
  listAdminTemplates,
  retryJobRow,
  revokeAdminAction,
  updateBrokerAdmin,
} from "@/lib/db/repositories/admin";
import { markJobCancelled } from "@/lib/db/repositories/jobs";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import type { BrokerVerificationStatus } from "@prisma/client";

export async function openAdminConsole(actor: ActorContext) {
  requirePermission(actor, "admin:console:access");
  await recordAudit({
    actor,
    action: "admin.console_accessed",
    resourceType: "instance",
  });
  return countAdminOverview();
}

export async function getAdminBrokers(actor: ActorContext) {
  requirePermission(actor, "admin:broker:read");
  return listAdminBrokers();
}

export async function changeBrokerVerification(
  actor: ActorContext,
  brokerId: string,
  verificationStatus: BrokerVerificationStatus
) {
  requirePermission(actor, "admin:broker:manage");
  const broker = await updateBrokerAdmin(brokerId, { verificationStatus });
  await recordAudit({
    actor,
    action: "admin.broker_verification_changed",
    resourceType: "broker",
    resourceId: brokerId,
  });
  return broker;
}

export async function changeBrokerProductionSending(
  actor: ActorContext,
  brokerId: string,
  enabled: boolean
) {
  requirePermission(actor, "admin:broker:manage");
  const broker = await updateBrokerAdmin(brokerId, { productionSendingEnabled: enabled });
  await recordAudit({
    actor,
    action: "admin.broker_production_sending_changed",
    resourceType: "broker",
    resourceId: brokerId,
  });
  return broker;
}

export async function getAdminLegalRules(actor: ActorContext) {
  requirePermission(actor, "admin:legalRule:read");
  return listAdminLegalRules();
}

export async function getAdminTemplates(actor: ActorContext) {
  requirePermission(actor, "admin:template:read");
  return listAdminTemplates();
}

export async function getAdminJobs(actor: ActorContext) {
  requirePermission(actor, "admin:job:read");
  return listAdminJobs();
}

export async function retryAdminJob(actor: ActorContext, jobId: string) {
  requirePermission(actor, "admin:job:manage");
  await retryJobRow(jobId);
  await recordAudit({
    actor,
    action: "admin.job_retried",
    resourceType: "background_job",
    resourceId: jobId,
  });
}

export async function cancelAdminJob(actor: ActorContext, jobId: string) {
  requirePermission(actor, "admin:job:manage");
  await markJobCancelled(jobId, "Cancelled by instance admin.");
  await recordAudit({
    actor,
    action: "admin.job_cancelled",
    resourceType: "background_job",
    resourceId: jobId,
  });
}

export async function getAdminAudit(actor: ActorContext) {
  requirePermission(actor, "admin:audit:read");
  return listAdminAudit(150);
}

export async function verifyAdminAuditChain(actor: ActorContext) {
  requirePermission(actor, "admin:audit:read");
  return verifyAuditChain();
}

export async function grantBreakGlass(
  actor: ActorContext,
  input: { targetUserId: string; justification: string; durationHours: number }
) {
  requirePermission(actor, "admin:user:list");
  if (input.justification.trim().length < 20) {
    throw new ValidationError("A justification of at least 20 characters is required.");
  }
  const grant = await createAdminAction({
    adminUserId: actor.userId,
    type: "BREAK_GLASS_GRANT",
    justification: input.justification.trim(),
    targetUserId: input.targetUserId.trim(),
    grantExpiresAt: addHours(new Date(), Math.min(Math.max(input.durationHours, 1), 24)),
  });
  await recordAudit({
    actor,
    action: "admin.break_glass_granted",
    resourceType: "user",
    resourceId: input.targetUserId,
  });
  return grant;
}

export async function revokeBreakGlass(actor: ActorContext, grantId: string) {
  requirePermission(actor, "admin:user:list");
  await revokeAdminAction(grantId);
  await recordAudit({
    actor,
    action: "admin.break_glass_revoked",
    resourceType: "user",
    resourceId: grantId,
  });
}

export async function listBreakGlass(actor: ActorContext) {
  requirePermission(actor, "admin:audit:read");
  return listActiveBreakGlassGrants();
}
