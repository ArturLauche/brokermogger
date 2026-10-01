import type { ContactMethodType, RequestChannel, RequestType } from "@prisma/client";

import { assertCurrentProfileConsent } from "@/lib/consent/current";
import { assertBrokerRequestCompatible } from "@/lib/brokers/coverage";
import { selectRequestDelivery } from "@/lib/brokers/sendable";
import { assertRenderedDelivery } from "@/lib/requests/rendering";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/core/errors";
import { prisma } from "@/lib/db/client";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import {
  requestCreatePerUserDay,
  requestCreatePerUserMonth,
} from "@/lib/rateLimit/policies";
import { assertTransition } from "@/lib/requests/stateMachine";
import { hashContextValue } from "@/lib/security/crypto";

import { reserveWeightedRequestCreate } from "./rateLimit";
import { appendRequestEventInTx, insertSnapshot, type SnapshotInput } from "./requests";
import { assertCurrentLegalBasisInTx } from "./requestLegalEligibility";

export interface PreparedDraft {
  id: string;
  profileId: string;
  brokerId: string;
  jurisdictionId: string;
  requestType: RequestType;
  channel: RequestChannel;
  legalRuleVersionId: string;
  templateVersionId: string;
  legalBasisText: string;
  deadlineDays: number | null;
  manualReviewReasons: string[];
  manualReviewRequired: boolean;
  destinationType: ContactMethodType | null;
  destinationValue: string | null;
  includedIdentifierIds: string[];
  includedIdentifiers: { type: string; masked: string }[];
  externalReference: string;
  sendableReasons: string[];
  snapshot: Omit<SnapshotInput, "removalRequestId" | "createdByUserId" | "version">;
}

/** All render work happens before this transaction; no partial batches or spent quota. */
export async function createPreparedDrafts(
  actor: ActorContext,
  drafts: PreparedDraft[],
  limits: { requestsPerDay: number; requestsPerMonth: number }
): Promise<string[]> {
  requirePermission(actor, "request:create", { ownerUserId: actor.userId });
  if (drafts.length === 0) return [];
  const now = new Date();
  const bucket = (policy: typeof requestCreatePerUserDay, limit: number) => ({
    scope: policy.scope,
    key: hashContextValue(
      `ratelimit|${policy.scope}|${actor.userId.trim().toLowerCase()}`
    )!,
    windowStart: new Date(
      Math.floor(now.getTime() / (policy.windowSeconds * 1000)) *
        policy.windowSeconds *
        1000
    ),
    windowSeconds: policy.windowSeconds,
    limit,
  });

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Serialize account mutation with deletion and concurrent draft batches.
        await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
        const account = await tx.user.findFirst({
          where: {
            id: actor.userId,
            status: "ACTIVE",
            deletedAt: null,
            deletionRequestedAt: null,
          },
          select: { id: true },
        });
        if (!account)
          throw new AppError({
            code: "FORBIDDEN",
            message: "This account is not active.",
          });
        const profileIds = [...new Set(drafts.map((draft) => draft.profileId))];
        const profiles = await tx.userProfile.findMany({
          where: {
            id: { in: profileIds },
            ownerUserId: actor.userId,
            deletedAt: null,
            consentStatus: { in: ["SELF", "EXPLICIT_CONSENT_OBTAINED"] },
          },
          include: {
            householdMember: {
              include: { consents: { orderBy: { createdAt: "desc" }, take: 1 } },
            },
          },
        });
        for (const profile of profiles) assertCurrentProfileConsent(profile);
        if (profiles.length !== profileIds.length)
          throw new AppError({
            code: "FORBIDDEN",
            message:
              "The profile or its consent changed. Review it before creating requests.",
          });

        // Broker editors lock these same parents before changing contacts or coverage.
        for (const id of [...new Set(drafts.map((draft) => draft.brokerId))].sort())
          await tx.$executeRaw`SELECT 1 FROM "Broker" WHERE id = ${id} FOR SHARE`;
        const brokers = await tx.broker.findMany({
          where: { id: { in: drafts.map((draft) => draft.brokerId) } },
          select: {
            id: true,
            isActive: true,
            deletedAt: true,
            jurisdictionCoverage: true,
            contactMethods: {
              select: {
                id: true,
                type: true,
                value: true,
                isActive: true,
                isVerified: true,
                isPreferred: true,
                priority: true,
                deletedAt: true,
              },
            },
          },
        });
        for (const draft of drafts) {
          const broker = brokers.find((row) => row.id === draft.brokerId);
          if (!broker)
            throw new AppError({
              code: "NOT_FOUND",
              message: "A selected broker is no longer available.",
            });
          assertBrokerRequestCompatible(broker, draft.jurisdictionId, draft.requestType);
          assertRenderedDelivery(draft.snapshot.variables, selectRequestDelivery(broker));
        }

        // A catalogue change between rendering and persistence must leave no partial
        // draft or consumed quota. Most batches share one jurisdiction and rule.
        const legalBases = new Map(
          drafts.map((draft) => [
            `${draft.legalRuleVersionId}:${draft.requestType}:${draft.channel}`,
            draft,
          ])
        );
        for (const [, draft] of [...legalBases].sort(([a], [b]) => a.localeCompare(b)))
          await assertCurrentLegalBasisInTx(tx, draft);

        if (env.RATE_LIMIT_ENABLED) {
          const reservation = await reserveWeightedRequestCreate(
            {
              userId: actor.userId,
              requestedCount: drafts.length,
              rollingSince: new Date(now.getTime() - 30 * 86_400_000),
              daily: bucket(requestCreatePerUserDay, limits.requestsPerDay),
              monthly: bucket(requestCreatePerUserMonth, limits.requestsPerMonth),
            },
            tx
          );
          if (!reservation.reserved)
            throw new AppError({
              code: "QUOTA_EXCEEDED",
              message: `The ${reservation.rejectedBucket} fair-use request limit has been reached. Try again after the current window.`,
            });
        } else if (
          drafts.length > Math.min(limits.requestsPerDay, limits.requestsPerMonth)
        ) {
          throw new AppError({
            code: "QUOTA_EXCEEDED",
            message: "This selection exceeds the instance's fair-use request budget.",
          });
        }

        for (const draft of drafts) {
          const { snapshot, sendableReasons, ...data } = draft;
          await tx.removalRequest.create({
            data: {
              ...data,
              userId: actor.userId,
              createdById: actor.userId,
              status: "DRAFT",
              // A statutory clock cannot start before the request is submitted.
              deadlineAt: null,
              metadata: { sendableReasons },
            },
          });
          const stored = await insertSnapshot(
            {
              ...snapshot,
              version: 1,
              removalRequestId: draft.id,
              createdByUserId: actor.userId,
            },
            tx
          );
          await tx.removalRequest.update({
            where: { id: draft.id },
            data: { currentSnapshotId: stored.id },
          });
          await appendRequestEventInTx(tx, {
            removalRequestId: draft.id,
            type: "CREATED",
            fromStatus: null,
            toStatus: "DRAFT",
            actorType: "USER",
            actorUserId: actor.userId,
            message: "Draft created.",
          });
          const readyStatus = draft.manualReviewRequired
            ? "MANUAL_REVIEW_REQUIRED"
            : "AWAITING_USER_APPROVAL";
          for (const [from, to] of [
            ["DRAFT", "PREPARED"],
            ["PREPARED", readyStatus],
          ] as const) {
            assertTransition(from, to, "USER");
            await tx.removalRequest.update({
              where: { id: draft.id },
              data: { status: to, lastEventAt: now },
            });
            await appendRequestEventInTx(tx, {
              removalRequestId: draft.id,
              type: "STATUS_CHANGE",
              fromStatus: from,
              toStatus: to,
              actorType: "USER",
              actorUserId: actor.userId,
              message:
                to === "PREPARED"
                  ? "Draft rendered from the published template."
                  : draft.manualReviewRequired
                    ? draft.manualReviewReasons.join(" ")
                    : "Ready for approval.",
            });
          }
        }
        return drafts.map((draft) => draft.id);
      },
      { timeout: 20_000 }
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const existing = await prisma.removalRequest.findMany({
        where: {
          userId: actor.userId,
          OR: drafts.map((draft) => ({
            profileId: draft.profileId,
            brokerId: draft.brokerId,
            requestType: draft.requestType,
          })),
          status: { notIn: ["CLOSED", "COMPLETED", "REJECTED", "FAILED"] },
          deletedAt: null,
        },
        select: { id: true },
      });
      throw new AppError({
        code: "CONFLICT",
        message:
          "An open request already exists for this profile, broker and request type. Continue from the existing request.",
        details: { requestIds: existing.map((request) => request.id) },
      });
    }
    throw error;
  }
}
