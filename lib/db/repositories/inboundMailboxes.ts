import { randomBytes, randomUUID } from "node:crypto";
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/core/errors";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { currentSendingIdentity } from "@/lib/requests/envelope";
import { blindIndex, decryptField, encryptField } from "@/lib/security/crypto";
import { parseAddress } from "@/lib/security/sanitize";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { lockActiveAccount } from "./access";
import { MAX_RECEIVING_RECIPIENTS } from "@/lib/email/limits";

/** Prepare the private reply identity before rendering; never spend request quota here. */
export async function prepareOwnedSendingIdentity(
  actor: ActorContext,
  ownerUserId: string
) {
  requirePermission(actor, "request:create", { ownerUserId });
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, ownerUserId);
    return sendingIdentityInTx(tx, ownerUserId, true);
  });
}

/** Called under the owner's account lock when generating or validating a snapshot. */
export async function sendingIdentityInTx(
  tx: PrismaTransaction,
  userId: string,
  create = false
) {
  const domain = env.RESEND_RECEIVING_DOMAIN;
  if (!domain) return currentSendingIdentity();
  let mailbox = await tx.inboundMailbox.findUnique({
    where: { userId_domain: { userId, domain } },
  });
  if (!mailbox && create) {
    const id = randomUUID();
    const address = `bm-${randomBytes(24).toString("hex")}@${domain}`;
    mailbox = await tx.inboundMailbox.create({
      data: {
        id,
        userId,
        domain,
        addressEnc: encryptField(address, {
          table: "InboundMailbox",
          column: "addressEnc",
          recordId: id,
        }),
        addressBi: blindIndex(address, "inbound:recipient", "email"),
      },
    });
  }
  if (!mailbox)
    throw new AppError({
      code: "CONFLICT",
      message:
        "The instance reply address changed. Regenerate this draft and review it again.",
    });
  return currentSendingIdentity(
    decryptField(mailbox.addressEnc, {
      table: "InboundMailbox",
      column: "addressEnc",
      recordId: mailbox.id,
    })
  );
}

/** A full private recipient address establishes ownership; a request reference never does. */
export async function receivingOwner(
  recipients: readonly string[],
  tx: PrismaTransaction = prisma
) {
  if (!env.RESEND_RECEIVING_DOMAIN || recipients.length > MAX_RECEIVING_RECIPIENTS)
    return null;
  const indexes: string[] = [];
  for (const value of recipients) {
    try {
      indexes.push(blindIndex(parseAddress(value).address, "inbound:recipient", "email"));
    } catch {
      /* An invalid recipient cannot select an owner. */
    }
  }
  const matches = await tx.inboundMailbox.findMany({
    where: {
      addressBi: { in: indexes },
      user: { status: "ACTIVE", deletionRequestedAt: null, deletedAt: null },
    },
    select: { userId: true },
    take: 101,
  });
  const owners = new Set(matches.map((row) => row.userId));
  return owners.size === 1 ? [...owners][0]! : null;
}
