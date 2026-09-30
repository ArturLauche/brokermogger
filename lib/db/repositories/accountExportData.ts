/** Explicit export projections: no tokens, ciphertext, blind indexes or storage credentials. */
import { z } from "zod";
import type { AccountExportMode } from "@prisma/client";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { AppError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import type { ClaimedJob } from "@/lib/jobs/types";
import { EXPORT_SECTIONS, type ExportSection } from "@/lib/exports/notices";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { decryptField } from "@/lib/security/crypto";
import { maskEmail, maskGeneric, maskName } from "@/lib/security/masking";
import { readAccountEmail } from "@/lib/security/accountEmail";
import { readSnapshotText } from "@/lib/requests/snapshot";
import { readApprovalEnvelope } from "@/lib/requests/envelope";
import { readResponseContent } from "@/lib/responses/content";
import { notificationPreferences } from "@/lib/notifications/preferences";
import { lockActiveAccount } from "./access";
import { currentExportInTx } from "./accountExports";

/** Internal generation batch; independent of the user-facing 100-row page limit. */
export const EXPORT_PAGE_SIZE = 250;
export type ExportRow = { id: string; [key: string]: unknown };
const pageSchema = z.object({
  userId: entityIdSchema,
  mode: z.enum(["MASKED", "SENSITIVE"]),
  section: z.enum(EXPORT_SECTIONS),
  cutoff: z.date(),
  cursor: entityIdSchema.optional(),
});
export async function loadAccountExportPage(
  actor: ActorContext,
  raw: unknown,
  job?: ClaimedJob<"GENERATE_ACCOUNT_EXPORT">
): Promise<ExportRow[]> {
  const input = parseWithSchema(pageSchema, raw);
  requirePermission(actor, "account:export", { ownerUserId: input.userId });
  if (input.mode === "SENSITIVE" && !job)
    throw new AppError({
      code: "CONSENT_REQUIRED",
      message: "A sensitive export needs its own confirmed generation request.",
    });
  return prisma.$transaction(
    async (tx) => {
      if (job) {
        const data = await currentExportInTx(tx, job);
        if (
          !data ||
          data.userId !== input.userId ||
          data.mode !== input.mode ||
          data.status !== "GENERATING" ||
          data.generationLeaseToken !== job.leaseToken ||
          data.sourceCutoffAt?.getTime() !== input.cutoff.getTime()
        )
          throw new AppError({
            code: "CONFLICT",
            message:
              "This export was cancelled, its approval expired or another worker took over.",
          });
      } else await lockActiveAccount(tx, input.userId);
      const rows = await readSection(tx, input);
      if (job)
        await tx.accountExport.update({
          where: { id: job.payload.exportId },
          data: { processedRecords: { increment: rows.length } },
        });
      return rows;
    },
    { timeout: 15_000 }
  );
}

const privateText = (table: string, column: string, id: string, value: string | null) =>
  value ? decryptField(value, { table, column, recordId: id }) : null;
const privateJson = (table: string, column: string, id: string, value: string | null) => {
  const text = privateText(table, column, id, value);
  return text ? (JSON.parse(text) as unknown) : null;
};
const label = (value: string | null, sensitive: boolean) =>
  value === null ? null : sensitive ? value : maskGeneric(value);

async function readSection(
  tx: PrismaTransaction,
  input: {
    userId: string;
    mode: AccountExportMode;
    section: ExportSection;
    cutoff: Date;
    cursor?: string | undefined;
  }
): Promise<ExportRow[]> {
  const userId = input.userId;
  const sensitive = input.mode === "SENSITIVE";
  const pageWhere = {
    ...(input.cursor ? { id: { gt: input.cursor } } : {}),
    createdAt: { lte: input.cutoff },
  };
  const paging = { orderBy: { id: "asc" as const }, take: EXPORT_PAGE_SIZE };
  const ownedProfile = { ownerUserId: userId, deletedAt: null };
  const ownedRequest = { userId, deletedAt: null, profile: ownedProfile };
  switch (input.section) {
    case "account": {
      if (input.cursor) return [];
      const row = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          emailEnc: true,
          name: true,
          timezone: true,
          locale: true,
          role: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          emailVerified: true,
          preferences: true,
        },
      });
      const email = readAccountEmail(row).email;
      return [
        {
          id: row.id,
          email: sensitive ? email : maskEmail(email),
          name: row.name ? (sensitive ? row.name : maskName(row.name)) : null,
          timezone: row.timezone,
          locale: row.locale,
          role: row.role,
          status: row.status,
          createdAt: row.createdAt,
          lastLoginAt: row.lastLoginAt,
          emailVerifiedAt: row.emailVerified,
          notificationPreference: notificationPreferences(row.preferences),
        },
      ];
    }
    case "profiles": {
      const rows = await tx.userProfile.findMany({
        where: { ...ownedProfile, ...pageWhere },
        ...paging,
        select: {
          id: true,
          kind: true,
          status: true,
          displayName: true,
          legalNameEnc: sensitive,
          contactEmailEnc: sensitive,
          contactEmailMasked: true,
          countryCode: true,
          region: true,
          residencyConfirmed: true,
          consentStatus: true,
          isPrimary: true,
          notes: sensitive,
          residencyNote: sensitive,
          onboardingCompletedAt: true,
          createdAt: true,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        displayName: label(r.displayName, sensitive),
        countryCode: r.countryCode,
        region: r.region,
        residencyConfirmed: r.residencyConfirmed,
        consentStatus: r.consentStatus,
        isPrimary: r.isPrimary,
        createdAt: r.createdAt,
        onboardingCompletedAt: r.onboardingCompletedAt,
        contactEmail: sensitive
          ? privateText("UserProfile", "contactEmailEnc", r.id, r.contactEmailEnc)
          : r.contactEmailMasked,
        ...(sensitive
          ? {
              legalName: privateText("UserProfile", "legalNameEnc", r.id, r.legalNameEnc),
              notes: r.notes,
              residencyNote: r.residencyNote,
            }
          : {}),
      }));
    }
    case "identifiers": {
      const rows = await tx.profileIdentifier.findMany({
        where: { profile: ownedProfile, deletedAt: null, ...pageWhere },
        ...paging,
        select: {
          id: true,
          profileId: true,
          type: true,
          label: true,
          valueEnc: sensitive,
          maskedPreview: true,
          sensitivity: true,
          isPrimary: true,
          verifiedAt: true,
          createdAt: true,
          usageScope: sensitive,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        profileId: r.profileId,
        type: r.type,
        label: label(r.label, sensitive),
        value: sensitive
          ? privateText("ProfileIdentifier", "valueEnc", r.id, r.valueEnc)
          : r.maskedPreview,
        sensitivity: r.sensitivity,
        isPrimary: r.isPrimary,
        verifiedAt: r.verifiedAt,
        createdAt: r.createdAt,
        ...(sensitive ? { usageScope: r.usageScope } : {}),
      }));
    }
    case "householdMembers": {
      const rows = await tx.householdMember.findMany({
        where: { ownerUserId: userId, deletedAt: null, ...pageWhere },
        ...paging,
        select: {
          id: true,
          profileId: true,
          relationship: true,
          status: true,
          invitedEmailEnc: sensitive,
          invitedEmailMasked: true,
          addedReason: sensitive,
          revokedAt: true,
          createdAt: true,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        profileId: r.profileId,
        relationship: r.relationship,
        status: r.status,
        invitedEmail: sensitive
          ? privateText("HouseholdMember", "invitedEmailEnc", r.id, r.invitedEmailEnc)
          : r.invitedEmailMasked,
        revokedAt: r.revokedAt,
        createdAt: r.createdAt,
        ...(sensitive ? { addedReason: r.addedReason } : {}),
      }));
    }
    case "householdConsents": {
      const rows = await tx.householdConsent.findMany({
        where: { requestedByUserId: userId, ...pageWhere },
        ...paging,
        select: {
          id: true,
          profileId: true,
          householdMemberId: true,
          status: true,
          contactEmailEnc: sensitive,
          contactEmailMasked: true,
          statementText: sensitive,
          statementHash: true,
          scope: sensitive,
          expiresAt: true,
          verifiedAt: true,
          declinedAt: true,
          revokedAt: true,
          createdAt: true,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        profileId: r.profileId,
        householdMemberId: r.householdMemberId,
        status: r.status,
        contactEmail: sensitive
          ? privateText("HouseholdConsent", "contactEmailEnc", r.id, r.contactEmailEnc)
          : r.contactEmailMasked,
        statementHash: r.statementHash,
        expiresAt: r.expiresAt,
        verifiedAt: r.verifiedAt,
        declinedAt: r.declinedAt,
        revokedAt: r.revokedAt,
        createdAt: r.createdAt,
        ...(sensitive ? { statement: r.statementText, scope: r.scope } : {}),
      }));
    }
    case "consents": {
      const rows = await tx.consentRecord.findMany({
        where: { profile: { ownerUserId: userId }, ...pageWhere },
        ...paging,
        select: {
          id: true,
          profileId: true,
          removalRequestId: true,
          householdConsentId: true,
          purpose: true,
          method: true,
          status: true,
          statementText: sensitive,
          statementHash: true,
          evidence: sensitive,
          grantedAt: true,
          expiresAt: true,
          revokedAt: true,
          hash: true,
          prevHash: true,
          createdAt: true,
        },
      });
      return rows.map(({ statementText, evidence, ...r }) => ({
        ...r,
        ...(sensitive ? { statement: statementText, evidence } : {}),
      }));
    }
    case "requests": {
      const rows = await tx.removalRequest.findMany({
        where: { ...ownedRequest, ...pageWhere },
        ...paging,
        select: {
          id: true,
          profileId: true,
          brokerId: true,
          broker: { select: { legalName: true } },
          jurisdiction: { select: { code: true } },
          requestType: true,
          channel: true,
          status: true,
          legalRuleVersionId: true,
          templateVersionId: true,
          legalBasisText: true,
          deadlineAt: true,
          deadlineOn: true,
          deadlineAnchorOn: true,
          deadlineBasis: true,
          deadlineIsEstimate: true,
          deadlineTimezone: true,
          deadlineNote: true,
          deadlinePolicyVersion: true,
          deadlineSnapshotId: true,
          deadlineWarningForAt: true,
          currentSnapshotId: true,
          approvedSnapshotId: true,
          approvedAt: true,
          sentAt: true,
          deliveredAt: true,
          firstResponseAt: true,
          completedAt: true,
          closedAt: true,
          followUpCount: true,
          nextFollowUpAt: true,
          createdAt: true,
          closureReason: sensitive,
          externalReference: sensitive,
        },
      });
      return rows.map(({ closureReason, externalReference, ...r }) => ({
        ...r,
        ...(sensitive ? { closureReason, externalReference } : {}),
      }));
    }
    case "snapshots": {
      const rows = await tx.requestSnapshot.findMany({
        where: { removalRequest: ownedRequest, ...pageWhere },
        ...paging,
        select: {
          id: true,
          removalRequestId: true,
          version: true,
          contentHash: true,
          templateVersionId: true,
          legalRuleVersionId: true,
          renderedAt: true,
          subject: sensitive,
          body: sensitive,
          payloadEnc: sensitive,
          erasedAt: true,
          envelopeEnc: sensitive,
          envelopeHash: sensitive,
          envelopeVersion: sensitive,
          createdAt: true,
        },
      });
      return rows.map((r) => {
        const text = sensitive && !r.erasedAt ? readSnapshotText(r) : null;
        return {
          id: r.id,
          removalRequestId: r.removalRequestId,
          version: r.version,
          contentHash: r.contentHash,
          templateVersionId: r.templateVersionId,
          legalRuleVersionId: r.legalRuleVersionId,
          renderedAt: r.renderedAt,
          createdAt: r.createdAt,
          erasedAt: r.erasedAt,
          ...(text
            ? {
                subject: text.subject,
                body: text.body,
                approvalEnvelope: r.envelopeEnc ? readApprovalEnvelope(r) : null,
              }
            : {}),
        };
      });
    }
    case "requestEvents": {
      const rows = await tx.removalRequestEvent.findMany({
        where: { removalRequest: ownedRequest, ...pageWhere },
        ...paging,
        select: {
          id: true,
          removalRequestId: true,
          type: true,
          fromStatus: true,
          toStatus: true,
          actorType: true,
          message: sensitive,
          correctsEventId: true,
          prevHash: true,
          hash: true,
          createdAt: true,
        },
      });
      return rows.map(({ message, ...r }) => ({
        ...r,
        ...(sensitive ? { message } : {}),
      }));
    }
    case "manualSubmissions":
      return tx.manualSubmission.findMany({
        where: { removalRequest: ownedRequest, ...pageWhere },
        ...paging,
        select: {
          id: true,
          removalRequestId: true,
          snapshotId: true,
          submittedOn: true,
          receivedOn: true,
          evidenceFileId: true,
          createdAt: true,
        },
      });
    case "responses": {
      const rows = await tx.brokerResponse.findMany({
        where: { userId, deletedAt: null, ...pageWhere },
        ...paging,
        select: {
          id: true,
          removalRequestId: true,
          brokerId: true,
          receivedAt: true,
          receivedOn: true,
          channel: true,
          classification: true,
          classificationRevision: true,
          confirmedAt: true,
          appliedStatus: true,
          evidenceFileId: true,
          fromAddress: sensitive,
          fromAddressEnc: sensitive,
          subjectEnc: sensitive,
          bodyEnc: sensitive,
          bodyPreview: sensitive,
          metadataEnc: sensitive,
          rawMetadata: sensitive,
          createdAt: true,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        removalRequestId: r.removalRequestId,
        brokerId: r.brokerId,
        receivedAt: r.receivedAt,
        receivedOn: r.receivedOn,
        channel: r.channel,
        classification: r.classification,
        classificationRevision: r.classificationRevision,
        confirmedAt: r.confirmedAt,
        appliedStatus: r.appliedStatus,
        evidenceFileId: r.evidenceFileId,
        createdAt: r.createdAt,
        ...(sensitive
          ? {
              content: readResponseContent(r),
              privateMetadata:
                privateJson("BrokerResponse", "metadataEnc", r.id, r.metadataEnc) ??
                r.rawMetadata,
            }
          : {}),
      }));
    }
    case "evidenceFiles": {
      const rows = await tx.evidenceFile.findMany({
        where: { userId, kind: { not: "ACCOUNT_EXPORT" }, ...pageWhere },
        ...paging,
        select: {
          id: true,
          profileId: true,
          removalRequestId: true,
          kind: true,
          contentType: true,
          byteSize: true,
          checksumSha256: true,
          filenameEnc: sensitive,
          filenameMasked: true,
          isTemporary: true,
          retentionPolicy: true,
          expiresAt: true,
          createdAt: true,
          deletedAt: true,
          storageState: true,
        },
      });
      return rows.map(({ filenameEnc, filenameMasked, ...r }) => ({
        ...r,
        filename:
          sensitive && !r.deletedAt
            ? privateText("EvidenceFile", "filenameEnc", r.id, filenameEnc)
            : filenameMasked,
        downloadPath:
          !r.deletedAt &&
          r.storageState === "READY" &&
          (!r.expiresAt || r.expiresAt > new Date())
            ? `/api/evidence/${r.id}/download`
            : null,
      }));
    }
    case "reports":
      return tx.report.findMany({
        where: { userId, deletedAt: null, ...pageWhere },
        ...paging,
        select: {
          id: true,
          profileId: true,
          dateFrom: true,
          dateTo: true,
          timeZone: true,
          format: true,
          status: true,
          generatedAt: true,
          evidenceFileId: true,
          summary: true,
          createdAt: true,
        },
      });
    case "notifications": {
      const rows = await tx.notification.findMany({
        where: { userId, ...pageWhere },
        ...paging,
        select: {
          id: true,
          profileId: true,
          removalRequestId: true,
          type: true,
          channel: true,
          severity: true,
          title: sensitive,
          body: sensitive,
          readAt: true,
          dismissedAt: true,
          emailedAt: true,
          emailDispatchState: true,
          createdAt: true,
        },
      });
      return rows.map(({ title, body, ...r }) => ({
        ...r,
        ...(sensitive ? { title, body } : {}),
      }));
    }
    case "outboundMessages": {
      const rows = await tx.outboundEmail.findMany({
        where: { userId, ...pageWhere },
        ...paging,
        select: {
          id: true,
          removalRequestId: true,
          profileId: true,
          purpose: true,
          status: true,
          provider: true,
          providerMessageId: true,
          snapshotId: true,
          approvalConsentRecordId: true,
          dispatchState: true,
          toAddressEnc: sensitive,
          toAddressMasked: true,
          fromAddress: sensitive,
          replyTo: sensitive,
          replyToEnc: sensitive,
          subjectEnc: sensitive,
          sentAt: true,
          deliveredAt: true,
          bouncedAt: true,
          complainedAt: true,
          failedAt: true,
          createdAt: true,
        },
      });
      return rows.map(
        ({
          toAddressEnc,
          toAddressMasked,
          fromAddress,
          replyTo,
          replyToEnc,
          subjectEnc,
          ...r
        }) => ({
          ...r,
          recipient: sensitive
            ? privateText("OutboundEmail", "toAddressEnc", r.id, toAddressEnc)
            : toAddressMasked,
          ...(sensitive
            ? {
                fromAddress,
                replyTo:
                  privateText("OutboundEmail", "replyToEnc", r.id, replyToEnc) ?? replyTo,
                subject: privateText("OutboundEmail", "subjectEnc", r.id, subjectEnc),
              }
            : {}),
        })
      );
    }
    case "webhookEvents": {
      const rows = await tx.emailWebhookEvent.findMany({
        where: {
          OR: [{ ownerUserId: userId }, { ownerUserId: null, outboundEmail: { userId } }],
          ...pageWhere,
        },
        ...paging,
        select: {
          id: true,
          eventType: true,
          provider: true,
          eventId: true,
          providerMessageId: true,
          outboundEmailId: true,
          brokerResponseId: true,
          signatureVerified: true,
          receivedAt: true,
          processedAt: true,
          payloadEnc: sensitive,
          payloadJson: sensitive,
        },
      });
      return rows.map(({ payloadEnc, payloadJson, ...r }) => ({
        ...r,
        ...(sensitive
          ? {
              payload:
                privateJson("EmailWebhookEvent", "payloadEnc", r.id, payloadEnc) ??
                payloadJson,
            }
          : {}),
      }));
    }
    case "receivingAddresses": {
      const rows = await tx.inboundMailbox.findMany({
        where: { userId, ...pageWhere },
        ...paging,
        select: { id: true, domain: true, addressEnc: sensitive, createdAt: true },
      });
      return rows.map(({ addressEnc, ...r }) => ({
        ...r,
        ...(sensitive
          ? { address: privateText("InboundMailbox", "addressEnc", r.id, addressEnc) }
          : {}),
      }));
    }
    case "sessions":
      return tx.session.findMany({
        where: { userId, ...pageWhere },
        ...paging,
        select: { id: true, expires: true, createdAt: true },
      });
    case "linkedAccounts": {
      const rows = await tx.account.findMany({
        where: { userId, ...pageWhere },
        ...paging,
        select: {
          id: true,
          type: true,
          provider: true,
          providerAccountId: true,
          createdAt: true,
        },
      });
      return rows.map(({ providerAccountId, ...r }) => ({
        ...r,
        providerAccountId: label(providerAccountId, sensitive),
      }));
    }
    case "quota":
      return tx.userQuota.findMany({
        where: { userId, ...pageWhere },
        ...paging,
        select: {
          id: true,
          maxProfiles: true,
          requestsPerDay: true,
          requestsPerMonth: true,
          requestsPerBrokerPer30Days: true,
          evidenceUploadsPerDay: true,
          magicLinksPer15Minutes: true,
          createdAt: true,
        },
      });
    case "audit": {
      const rows = await tx.auditLog.findMany({
        where: { OR: [{ actorUserId: userId }, { targetUserId: userId }], ...pageWhere },
        ...paging,
        select: {
          id: true,
          sequence: true,
          action: true,
          actorType: true,
          actorRole: true,
          resourceType: true,
          resourceId: true,
          outcome: true,
          prevHash: true,
          hash: true,
          createdAt: true,
        },
      });
      return rows.map(({ sequence, ...r }) => ({ ...r, sequence: sequence.toString() }));
    }
    case "administrativeAccess":
      return tx.adminAction.findMany({
        where: { targetUserId: userId, ...pageWhere },
        ...paging,
        select: {
          id: true,
          type: true,
          targetResourceType: true,
          targetResourceId: true,
          grantExpiresAt: true,
          revokedAt: true,
          createdAt: true,
        },
      });
    case "jobs":
      return tx.backgroundJob.findMany({
        where: { relatedUserId: userId, ...pageWhere },
        ...paging,
        select: {
          id: true,
          type: true,
          status: true,
          relatedRequestId: true,
          runAt: true,
          attemptCount: true,
          maxAttempts: true,
          completedAt: true,
          cancelledAt: true,
          createdAt: true,
        },
      });
    case "exports":
      return tx.accountExport.findMany({
        where: { userId, ...pageWhere },
        ...paging,
        select: {
          id: true,
          mode: true,
          status: true,
          consentedAt: true,
          consentVersion: true,
          consentStatementHash: true,
          generatedAt: true,
          expiresAt: true,
          deletedAt: true,
          createdAt: true,
        },
      });
  }
}
