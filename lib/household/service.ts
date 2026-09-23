/** Explicit adult invitations; every decision and revocation is transactional. */
import { recordAudit } from "@/lib/audit/service";
import { env } from "@/lib/config/env";
import { getOwnedProfile, softDeleteProfile } from "@/lib/db/repositories/profiles";
import {
  listHouseholdForOwner,
  getOwnedHouseholdMember,
} from "@/lib/db/repositories/household";
import {
  createAdultInvitation,
  resendAdultInvitation,
  revokeAdultConsent,
  decideInvitationRecord,
  readPublicInvitation,
} from "@/lib/db/repositories/householdInvitations";
import { buildConsentInviteMessage, getEmailProvider } from "@/lib/email";
import type { ActorContext } from "@/lib/permissions/actor";
import { randomToken, sha256Hex } from "@/lib/security/crypto";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import {
  householdDecisionSchema,
  householdInvitationSchema,
  invitationTokenSchema,
} from "./validation";
export { CONSENT_STATEMENT, HOUSEHOLD_ADULT_CONFIRMATION } from "./validation";

async function deliverInvitation(
  actor: ActorContext,
  invitation: Awaited<ReturnType<typeof createAdultInvitation>>,
  token: string
) {
  let delivery: "sent" | "simulated" | "failed";
  try {
    const result = await getEmailProvider().sendEmail({
      ...buildConsentInviteMessage({
        to: { address: invitation.email },
        acceptUrl: `${env.APP_BASE_URL}/household/consent/${token}`,
        requesterDisplayName: "the account holder",
        expiresAt: invitation.expiresAt,
      }),
      idempotencyKey: `household-invite:${invitation.consentId}`,
    });
    delivery = result.dispatched ? "sent" : "simulated";
  } catch {
    delivery = "failed";
  }
  await recordAudit({
    actor,
    action: "household.consent_invited",
    resourceType: "household_consent",
    resourceId: invitation.consentId,
    metadata: { delivery },
  });
  return { profileId: invitation.profileId, memberId: invitation.memberId, delivery };
}
export async function inviteHouseholdAdult(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(householdInvitationSchema, raw);
  const token = randomToken();
  const invitation = await createAdultInvitation(actor, input, sha256Hex(token));
  await recordAudit({
    actor,
    action: "household.member_added",
    resourceType: "household_member",
    resourceId: invitation.memberId,
  });
  return deliverInvitation(actor, invitation, token);
}
export async function resendHouseholdInvitation(actor: ActorContext, rawId: unknown) {
  const token = randomToken();
  const invitation = await resendAdultInvitation(
    actor,
    parseWithSchema(entityIdSchema, rawId),
    sha256Hex(token)
  );
  return deliverInvitation(actor, invitation, token);
}
export async function revokeHouseholdConsent(actor: ActorContext, rawId: unknown) {
  const id = parseWithSchema(entityIdSchema, rawId);
  await revokeAdultConsent(actor, id);
  await recordAudit({
    actor,
    action: "household.consent_revoked",
    resourceType: "household_member",
    resourceId: id,
  });
}
export async function listHousehold(actor: ActorContext) {
  return listHouseholdForOwner(actor);
}
export async function removeHouseholdMember(actor: ActorContext, memberId: string) {
  const member = await getOwnedHouseholdMember(
    actor,
    parseWithSchema(entityIdSchema, memberId)
  );
  await getOwnedProfile(actor, member.profileId);
  await softDeleteProfile(actor, member.profileId);
  await recordAudit({
    actor,
    action: "household.member_removed",
    resourceType: "household_member",
    resourceId: memberId,
  });
}
export async function resolveConsentInvitation(token: string) {
  const parsed = invitationTokenSchema.safeParse(token);
  return parsed.success ? readPublicInvitation(sha256Hex(parsed.data)) : null;
}
export async function decideHouseholdConsent(raw: unknown) {
  return decideInvitationRecord(parseWithSchema(householdDecisionSchema, raw));
}
