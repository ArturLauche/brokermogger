/** Versioned approval identity. Text is bound by its immutable snapshot hash. */
import { ContactMethodType, RequestChannel, RequestType } from "@prisma/client";
import { z } from "zod";

import { env } from "@/lib/config/env";
import { AppError } from "@/lib/core/errors";
import {
  canonicalJson,
  decryptField,
  encryptField,
  sha256Hex,
} from "@/lib/security/crypto";
import {
  assertValidEmailAddress,
  parseAddress,
  sanitiseHeaderValue,
} from "@/lib/security/sanitize";
import { entityIdSchema } from "@/lib/validation/ids";

export const approvalCommandSchema = z.object({
  requestId: entityIdSchema,
  envelopeHash: z.string().regex(/^[a-f0-9]{64}$/),
  confirmationAccepted: z.literal(true),
});
export type ApprovalCommand = z.infer<typeof approvalCommandSchema>;

const envelopeSchema = z.object({
  version: z.literal(1),
  requestId: entityIdSchema,
  snapshotId: entityIdSchema,
  profileId: entityIdSchema,
  brokerId: entityIdSchema,
  jurisdictionId: entityIdSchema,
  requestType: z.enum(RequestType),
  channel: z.enum(RequestChannel),
  destinationType: z.enum(ContactMethodType).nullable(),
  destination: z.string().max(4000).nullable(),
  fromAddress: z.string().max(320),
  replyTo: z.string().email().max(320),
  identifierIds: z.array(entityIdSchema).max(100),
  identifierDigest: z.string().regex(/^[a-f0-9]{64}$/),
  profileDigest: z.string().regex(/^[a-f0-9]{64}$/),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  templateVersionId: entityIdSchema.nullable(),
  legalRuleVersionId: entityIdSchema.nullable(),
  followUpNumber: z.number().int().min(0).max(20),
});
export type ApprovalEnvelope = z.infer<typeof envelopeSchema>;

export function currentSendingIdentity(replyTo?: string) {
  return {
    fromAddress: sanitiseHeaderValue(env.EMAIL_FROM, "fromAddress", 320),
    replyTo: assertValidEmailAddress(
      replyTo ?? env.EMAIL_REPLY_TO ?? parseAddress(env.EMAIL_FROM).address,
      "replyTo"
    ),
  };
}

export function sealApprovalEnvelope(input: ApprovalEnvelope) {
  const envelope = envelopeSchema.parse(input);
  if (envelope.channel === "EMAIL" && envelope.destination)
    assertValidEmailAddress(envelope.destination, "destination");
  const canonical = canonicalJson(envelope);
  return {
    envelopeVersion: 1,
    envelopeHash: sha256Hex(canonical),
    envelopeEnc: encryptField(canonical, {
      table: "RequestSnapshot",
      column: "envelopeEnc",
      recordId: envelope.snapshotId,
    }),
  };
}

export function readApprovalEnvelope(snapshot: {
  id: string;
  contentHash: string;
  envelopeVersion: number | null;
  envelopeHash: string | null;
  envelopeEnc: string | null;
}): ApprovalEnvelope {
  if (!snapshot.envelopeEnc || snapshot.envelopeVersion !== 1 || !snapshot.envelopeHash)
    throw new AppError({
      code: "CONFLICT",
      message:
        "This legacy draft needs a new snapshot and fresh review before it can be approved.",
    });
  const envelope = envelopeSchema.parse(
    JSON.parse(
      decryptField(snapshot.envelopeEnc, {
        table: "RequestSnapshot",
        column: "envelopeEnc",
        recordId: snapshot.id,
      })
    )
  );
  if (
    sha256Hex(canonicalJson(envelope)) !== snapshot.envelopeHash ||
    envelope.snapshotId !== snapshot.id ||
    envelope.contentHash !== snapshot.contentHash
  )
    throw new AppError({
      code: "CONFLICT",
      message: "The approved message failed its integrity check.",
    });
  return envelope;
}

export function identifierDigest(
  identifiers: readonly { id: string; valueBi: string }[]
): string {
  return sha256Hex(
    identifiers
      .map((item) => `${item.id}:${item.valueBi}`)
      .sort()
      .join("|")
  );
}

export interface ProfileIdentity {
  legalNameBi: string | null;
  contactEmailBi: string | null;
  countryCode: string;
  region: string | null;
  residencyConfirmed: boolean;
}

export function profileIdentityDigest(profile: ProfileIdentity): string {
  return sha256Hex(
    canonicalJson({
      legalNameBi: profile.legalNameBi,
      contactEmailBi: profile.contactEmailBi,
      countryCode: profile.countryCode,
      region: profile.region,
      residencyConfirmed: profile.residencyConfirmed,
    })
  );
}

export function assertEnvelopeMatchesRequest(
  envelope: ApprovalEnvelope,
  request: {
    id: string;
    profileId: string;
    brokerId: string;
    jurisdictionId: string;
    requestType: RequestType;
    channel: RequestChannel;
    destinationType: ContactMethodType | null;
    destinationValue: string | null;
    includedIdentifierIds: string[];
    legalRuleVersionId: string | null;
    templateVersionId: string | null;
    followUpCount: number;
  },
  identifiers: readonly { id: string; valueBi: string }[],
  profile: ProfileIdentity,
  sendingIdentity = currentSendingIdentity()
) {
  const current: ApprovalEnvelope = {
    ...envelope,
    ...sendingIdentity,
    requestId: request.id,
    profileId: request.profileId,
    brokerId: request.brokerId,
    jurisdictionId: request.jurisdictionId,
    requestType: request.requestType,
    channel: request.channel,
    destinationType: request.destinationType,
    destination: request.destinationValue,
    identifierIds: [...request.includedIdentifierIds].sort(),
    identifierDigest: identifierDigest(identifiers),
    profileDigest: profileIdentityDigest(profile),
    legalRuleVersionId: request.legalRuleVersionId,
    templateVersionId: request.templateVersionId,
    followUpNumber: request.followUpCount,
  };
  if (
    canonicalJson(current) !== canonicalJson(envelope) ||
    identifiers.length !== envelope.identifierIds.length
  )
    throw new AppError({
      code: "CONFLICT",
      message:
        "The destination, sending identity, identifiers or source version changed. Regenerate the draft and review it again.",
    });
}
