/** Bounded maintenance batches. Run with app and workers stopped. */
import { env } from "@/lib/config/env";
import { AppError } from "@/lib/core/errors";
import { prisma } from "@/lib/db/client";
import { encryptSnapshotText, readSnapshotText } from "@/lib/requests/snapshot";
import {
  encryptedAccountEmail,
  verificationEmailIndex,
} from "@/lib/security/accountEmail";
import {
  decryptBytes,
  decryptField,
  encryptBytes,
  encryptField,
  sha256Hex,
} from "@/lib/security/crypto";
import { getStorage } from "@/lib/storage";

export async function backfillPrivatePayloads(take = 100) {
  if (env.ALLOW_EXTERNAL_SENDING)
    throw new AppError({
      code: "FORBIDDEN",
      message: "Disable external sending before upgrading private storage.",
    });
  const counts = {
    users: 0,
    snapshots: 0,
    webhooks: 0,
    files: 0,
    labels: 0,
    tokens: 0,
    outbound: 0,
  };
  const users = await prisma.user.findMany({
    where: {
      emailEnc: null,
      anonymizedAt: null,
      status: { notIn: ["DELETED", "PENDING_DELETION"] },
    },
    take,
    orderBy: { id: "asc" },
  });
  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: encryptedAccountEmail(user.id, user.email),
    });
    counts.users += 1;
  }
  const tokens = await prisma.verificationToken.findMany({
    where: { identifier: { contains: "@" } },
    take,
  });
  for (const token of tokens) {
    await prisma.verificationToken.update({
      where: { identifier_token: { identifier: token.identifier, token: token.token } },
      data: { identifier: verificationEmailIndex(token.identifier) },
    });
    counts.tokens += 1;
  }
  const snapshots = await prisma.requestSnapshot.findMany({
    where: { payloadEnc: null, erasedAt: null },
    take,
    orderBy: { id: "asc" },
  });
  for (const snapshot of snapshots) {
    if (sha256Hex(`${snapshot.subject}\n${snapshot.body}`) !== snapshot.contentHash)
      throw new AppError({
        code: "CONFLICT",
        message:
          "A legacy snapshot failed its hash check. Restore or investigate before continuing.",
        details: { snapshotId: snapshot.id },
      });
    const payloadEnc = encryptSnapshotText(snapshot.id, snapshot.subject, snapshot.body);
    readSnapshotText({ ...snapshot, payloadEnc });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('brokermogger.reencode_snapshot', 'on', true)`;
      await tx.requestSnapshot.update({
        where: { id: snapshot.id },
        data: { payloadEnc, subject: "", body: "" },
      });
    });
    counts.snapshots += 1;
  }
  const webhooks = await prisma.emailWebhookEvent.findMany({
    where: { payloadEnc: null },
    take,
    orderBy: { id: "asc" },
  });
  for (const event of webhooks) {
    await prisma.emailWebhookEvent.update({
      where: { id: event.id },
      data: {
        payloadJson: {},
        payloadEnc: encryptField(JSON.stringify(event.payloadJson), {
          table: "EmailWebhookEvent",
          column: "payloadEnc",
          recordId: event.id,
        }),
      },
    });
    counts.webhooks += 1;
  }
  const outgoing = await prisma.outboundEmail.findMany({
    where: { replyTo: { not: null } },
    take,
    orderBy: { id: "asc" },
  });
  for (const item of outgoing) {
    const context = { table: "OutboundEmail", column: "replyToEnc", recordId: item.id };
    const replyToEnc = encryptField(item.replyTo!, context);
    if (decryptField(replyToEnc, context) !== item.replyTo)
      throw new AppError({
        code: "INTERNAL_ERROR",
        message: "Reply address migration did not verify.",
      });
    await prisma.outboundEmail.update({
      where: { id: item.id },
      data: { replyToEnc, replyTo: null },
    });
    counts.outbound += 1;
  }
  const files = await prisma.evidenceFile.findMany({
    where: {
      encryption: { not: "APPLICATION_AES_GCM" },
      storageState: "READY",
      deletedAt: null,
    },
    take,
    orderBy: { id: "asc" },
  });
  for (const file of files) {
    const storage = getStorage(file.storageBackend);
    const stored = await storage.get(file.storageKey);
    const context = { table: "EvidenceFile", column: "object", recordId: file.id };
    const alreadyEncrypted = stored.subarray(0, 4).toString("ascii") === "bmf1";
    const plaintext = alreadyEncrypted ? decryptBytes(stored, context) : stored;
    if (sha256Hex(plaintext) !== file.checksumSha256)
      throw new AppError({
        code: "STORAGE_FAILED",
        message:
          "A legacy file failed its checksum. Restore or investigate before continuing.",
        details: { fileId: file.id },
      });
    if (!alreadyEncrypted)
      await storage.put({
        key: file.storageKey,
        body: encryptBytes(plaintext, context),
        contentType: "application/octet-stream",
      });
    // Read back before clearing the migration marker, including after a resumed write.
    const verifiedEnvelope = await storage.get(file.storageKey);
    if (sha256Hex(decryptBytes(verifiedEnvelope, context)) !== file.checksumSha256)
      throw new AppError({
        code: "STORAGE_FAILED",
        message: "Encrypted file verification failed.",
      });
    await prisma.evidenceFile.update({
      where: { id: file.id },
      data: {
        encryption: "APPLICATION_AES_GCM",
        encryptionKeyId: verifiedEnvelope
          .subarray(5, 5 + verifiedEnvelope[4]!)
          .toString("ascii"),
      },
    });
    counts.files += 1;
  }
  // Labels are scanned in bounded pages only after the payload batches finish.
  if (
    counts.users +
      counts.snapshots +
      counts.webhooks +
      counts.files +
      counts.tokens +
      counts.outbound ===
    0
  ) {
    let cursor: string | undefined;
    while (true) {
      const profiles = await prisma.userProfile.findMany({
        where: {
          legalNameEnc: { not: null },
          displayName: { notIn: ["My profile", "Household member"] },
        },
        select: { id: true, kind: true, displayName: true, legalNameEnc: true },
        orderBy: { id: "asc" },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const profile of profiles) {
        const name = decryptField(profile.legalNameEnc!, {
          table: "UserProfile",
          column: "legalNameEnc",
          recordId: profile.id,
        });
        if (name === profile.displayName) {
          await prisma.userProfile.update({
            where: { id: profile.id },
            data: {
              displayName: profile.kind === "SELF" ? "My profile" : "Household member",
            },
          });
          counts.labels += 1;
        }
      }
      if (profiles.length < take) break;
      cursor = profiles[profiles.length - 1]!.id;
    }
  }
  return counts;
}

export async function disconnectMaintenanceClient(): Promise<void> {
  await prisma.$disconnect();
}
