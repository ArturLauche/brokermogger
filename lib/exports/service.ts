import { recordAudit } from "@/lib/audit/service";
import type { ActorContext } from "@/lib/permissions/actor";
import { systemActor } from "@/lib/permissions/actor";
import type { ClaimedJob } from "@/lib/jobs/types";
import { parseJobPayload } from "@/lib/jobs/payloads";
import {
  beginAccountExport,
  createAccountExport,
  deleteOwnedAccountExport,
  failAccountExport,
  getExportForDownload,
  publishAccountExport,
  abandonUnpublishedExportFile,
} from "@/lib/db/repositories/accountExports";
import {
  loadAccountExportPage,
  EXPORT_PAGE_SIZE,
} from "@/lib/db/repositories/accountExportData";
import { downloadEvidence } from "@/lib/evidence/service";
import { purgePrivateFile, storePrivateFile } from "@/lib/storage/privateFiles";
import { parseWithSchema } from "@/lib/validation/form";
import { exportInputSchema } from "./validation";
import {
  EXPORT_NOTICE_VERSION,
  EXPORT_SECTIONS,
  SENSITIVE_EXPORT_NOTICE,
} from "./notices";
import { sha256Hex } from "@/lib/security/crypto";

type ExportJob = ClaimedJob<"GENERATE_ACCOUNT_EXPORT">;

export async function requestAccountExport(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(exportInputSchema, raw);
  const data = await createAccountExport(actor, input);
  await recordAudit({
    actor,
    action: "account.export_requested",
    resourceType: "account_export",
    resourceId: data.id,
    metadata: {
      mode: input.mode,
      ...(input.mode === "SENSITIVE"
        ? {
            noticeVersion: EXPORT_NOTICE_VERSION,
            noticeHash: sha256Hex(SENSITIVE_EXPORT_NOTICE),
          }
        : {}),
    },
  });
  return data;
}
export async function deleteAccountExport(actor: ActorContext, id: string) {
  await deleteOwnedAccountExport(actor, id);
  await recordAudit({
    actor,
    action: "account.export_deleted",
    resourceType: "account_export",
    resourceId: id,
  });
}
export async function downloadAccountExport(actor: ActorContext, id: string) {
  const data = await getExportForDownload(actor, id);
  const { body } = await downloadEvidence(actor, data.evidenceFileId!);
  await recordAudit({
    actor,
    action: "account.export_downloaded",
    resourceType: "account_export",
    resourceId: id,
    metadata: { mode: data.mode },
  });
  return { body, filename: `brokermogger-${data.mode.toLowerCase()}-export.json` };
}

/** Keeps the original masked-download endpoint, now covering all owned categories. */
export async function exportMaskedAccount(actor: ActorContext) {
  await recordAudit({
    actor,
    action: "account.export_requested",
    resourceType: "user",
    resourceId: actor.userId,
    metadata: { mode: "MASKED" },
  });
  const body = await buildAccountExport(actor, {
    userId: actor.userId,
    mode: "MASKED",
    cutoff: new Date(),
  });
  await recordAudit({
    actor,
    action: "account.export_downloaded",
    resourceType: "user",
    resourceId: actor.userId,
    metadata: { mode: "MASKED" },
  });
  return body;
}

async function buildAccountExport(
  actor: ActorContext,
  input: { userId: string; mode: "MASKED" | "SENSITIVE"; cutoff: Date },
  job?: ExportJob
) {
  const counts: Record<string, number> = {};
  const header = {
    schemaVersion: 2,
    mode: input.mode,
    generationStartedAt: input.cutoff.toISOString(),
    notes: [
      "Records created after generation began are excluded. Values reflect each page when read, not a frozen historical database snapshot.",
      input.mode === "MASKED"
        ? "Identifiers and user-provided labels are masked. Letter, reply and private webhook contents are omitted. This file still contains private account history."
        : "This JSON contains unmasked personal data. Downloaded copies are unencrypted; keep them private.",
      "Original file contents are not embedded. Evidence metadata includes private authenticated download paths for files still available. Erased and expired data cannot be recovered.",
      "Authentication tokens, session secrets, blind indexes, ciphertext, encryption keys, storage credentials and operator configuration are excluded.",
      "The audit category contains account-related proof, not the entire instance hash chain. Retention and erasure can leave referenced historical records unavailable.",
    ],
  };
  const chunks = [Buffer.from(`${JSON.stringify(header).slice(0, -1)},\n`, "utf8")];
  for (const section of EXPORT_SECTIONS) {
    chunks.push(Buffer.from(`${JSON.stringify(section)}:[\n`));
    let cursor: string | undefined;
    let count = 0;
    for (;;) {
      const page = await loadAccountExportPage(
        actor,
        { ...input, section, ...(cursor ? { cursor } : {}) },
        job
      );
      for (const row of page) {
        chunks.push(Buffer.from(`${count ? ",\n" : ""}${JSON.stringify(row)}`, "utf8"));
        count += 1;
      }
      if (page.length < EXPORT_PAGE_SIZE) break;
      cursor = page.at(-1)!.id;
    }
    counts[section] = count;
    chunks.push(Buffer.from("\n],\n"));
  }
  // Recheck access before returning an in-memory copy or moving to private storage.
  await loadAccountExportPage(
    actor,
    { ...input, section: "account", cursor: input.userId },
    job
  );
  chunks.push(
    Buffer.from(
      `"recordCounts":${JSON.stringify(counts)},"generationFinishedAt":${JSON.stringify(new Date().toISOString())}}\n`
    )
  );
  return Buffer.concat(chunks);
}

export async function generateAccountExport(job: ExportJob) {
  parseJobPayload("GENERATE_ACCOUNT_EXPORT", job.payload);
  const data = await beginAccountExport(job);
  if (!data)
    return {
      message: "The export is complete, cancelled, expired or owned by another worker.",
    };
  let fileId: string | undefined;
  try {
    const body = await buildAccountExport(
      systemActor(job.id),
      { userId: data.userId, mode: data.mode, cutoff: data.sourceCutoffAt! },
      job
    );
    const file = await storePrivateFile(systemActor(job.id), {
      userId: data.userId,
      kind: "ACCOUNT_EXPORT",
      filename: `brokermogger-${data.mode.toLowerCase()}-export.json`,
      contentType: "application/json",
      body,
      deferReady: true,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    fileId = file.id;
    const published = await publishAccountExport(job, file.id);
    return {
      message: published
        ? "The private export is available for 24 hours."
        : "The export was cancelled before publication.",
    };
  } catch (error) {
    await failAccountExport(job);
    throw error;
  } finally {
    if (fileId) {
      const abandoned = await abandonUnpublishedExportFile(fileId);
      if (abandoned) await purgePrivateFile(abandoned).catch(() => undefined);
    }
  }
}
