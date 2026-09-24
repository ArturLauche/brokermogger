import { prisma } from "@/lib/db/client";
import { AppError } from "@/lib/core/errors";
import { minimalDeliveryPayload } from "@/lib/email/delivery";
import { receivedWebhookSchema } from "@/lib/email/receiving";
import { decryptField, encryptField } from "@/lib/security/crypto";
import { receivingOwner } from "./inboundMailboxes";
import { getWebhookPayload } from "./outboundEmail";

/** Offline, resumable upgrade: retain only required provider fields and establish ownership. */
export async function backfillWebhookPayloads(take: number) {
  let changed = 0;
  let cursor: string | undefined;
  while (changed < take) {
    const rows = await prisma.emailWebhookEvent.findMany({
      where: { OR: [{ payloadEnc: { not: null } }, { payloadJson: { not: {} } }] },
      orderBy: { id: "asc" },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows) {
      const old = getWebhookPayload(row);
      let ownerUserId = row.ownerUserId;
      let payload: unknown = null;
      let providerMessageId = row.providerMessageId;
      if (row.signatureVerified && row.eventType === "email.received") {
        const parsed = receivedWebhookSchema.safeParse(old);
        if (parsed.success) {
          ownerUserId ??= await receivingOwner(parsed.data.data.to);
          if (ownerUserId) payload = parsed.data;
          providerMessageId = parsed.data.data.email_id;
        }
      } else if (row.signatureVerified) {
        const minimal = minimalDeliveryPayload(old);
        payload = minimal;
        providerMessageId = minimal?.data.email_id ?? null;
        if (!ownerUserId && providerMessageId) {
          const matches = await prisma.outboundEmail.findMany({
            where: { provider: "RESEND", providerMessageId },
            select: { userId: true },
            take: 2,
          });
          if (matches.length === 1) ownerUserId = matches[0]!.userId;
        }
      }
      if (
        ownerUserId &&
        !(await prisma.user.findFirst({
          where: { id: ownerUserId, status: "ACTIVE", deletionRequestedAt: null },
          select: { id: true },
        }))
      )
        payload = null;
      if (!payload) {
        await prisma.emailWebhookEvent.update({
          where: { id: row.id },
          data: {
            payloadEnc: null,
            payloadJson: {},
            processedAt: row.processedAt ?? new Date(),
            processingError: "legacy_payload_discarded",
            ownerUserId,
            providerMessageId,
          },
        });
        changed += 1;
      } else if (
        !row.payloadEnc ||
        JSON.stringify(old) !== JSON.stringify(payload) ||
        ownerUserId !== row.ownerUserId ||
        providerMessageId !== row.providerMessageId ||
        JSON.stringify(row.payloadJson) !== "{}"
      ) {
        const context = {
          table: "EmailWebhookEvent",
          column: "payloadEnc",
          recordId: row.id,
        };
        const value = JSON.stringify(payload);
        const payloadEnc = encryptField(value, context);
        if (decryptField(payloadEnc, context) !== value)
          throw new AppError({
            code: "CONFLICT",
            message: "Webhook migration failed verification before clearing its source.",
          });
        await prisma.emailWebhookEvent.update({
          where: { id: row.id },
          data: { payloadJson: {}, payloadEnc, ownerUserId, providerMessageId },
        });
        changed += 1;
      }
      if (changed >= take) return changed;
    }
    if (rows.length < take) break;
    cursor = rows[rows.length - 1]!.id;
  }
  return changed;
}
