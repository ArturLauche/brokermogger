/**
 * Admin console helpers.
 */

import { recordAudit, verifyAuditChain } from "@/lib/audit/service";
import {
  countAdminOverview,
  createBreakGlassGrant,
  listActiveBreakGlassGrants,
  listAdminAudit,
  listAdminJobs,
  retryJobRow,
  cancelJobRow,
  revokeAdminAction,
} from "@/lib/db/repositories/admin";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";

export async function openAdminConsole(actor: ActorContext) {
  requirePermission(actor, "admin:console:access");
  await recordAudit({
    actor,
    action: "admin.console_accessed",
    resourceType: "instance",
  });
  return countAdminOverview(actor);
}

export async function getAdminJobs(actor: ActorContext, raw: unknown = {}) {
  requirePermission(actor, "admin:job:read");
  return listAdminJobs(actor, raw);
}

export async function retryAdminJob(actor: ActorContext, jobId: string) {
  requirePermission(actor, "admin:job:manage");
  await retryJobRow(actor, jobId);
  await recordAudit({
    actor,
    action: "admin.job_retried",
    resourceType: "background_job",
    resourceId: jobId,
  });
}

export async function cancelAdminJob(actor: ActorContext, jobId: string) {
  requirePermission(actor, "admin:job:manage");
  await cancelJobRow(actor, jobId);
  await recordAudit({
    actor,
    action: "admin.job_cancelled",
    resourceType: "background_job",
    resourceId: jobId,
  });
}

export async function getAdminAudit(actor: ActorContext, raw: unknown = {}) {
  requirePermission(actor, "admin:audit:read");
  return listAdminAudit(actor, raw);
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
  const grant = await createBreakGlassGrant(actor, input);
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
  await revokeAdminAction(actor, grantId);
  await recordAudit({
    actor,
    action: "admin.break_glass_revoked",
    resourceType: "user",
    resourceId: grantId,
  });
}

export async function listBreakGlass(actor: ActorContext) {
  requirePermission(actor, "admin:audit:read");
  return listActiveBreakGlassGrants(actor);
}
