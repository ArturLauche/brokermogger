/** Local disposable Docker verification; refuses any real instance. */
import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config/env";
import { encryptedAccountEmail } from "@/lib/security/accountEmail";
import { sha256Hex } from "@/lib/security/crypto";
import { encryptedProfileFields } from "@/lib/profiles/fields";
import { createLogger } from "@/lib/observability/logger";
import { systemActor, type ActorContext } from "@/lib/permissions/actor";
import { storePrivateFile } from "@/lib/storage/privateFiles";
import { getStorage } from "@/lib/storage";
import { requestReport } from "@/lib/reports/service";
import { requestAccountExport } from "@/lib/exports/service";

const command = z.enum(["prepare", "wait", "verify"]).parse(process.argv[2]);
const infoSchema = z.object({
  evidenceId: z.string(),
  reportId: z.string(),
  exportId: z.string(),
  sensitiveExportId: z.string(),
  userId: z.string(),
  sessionToken: z.string(),
});
const infoPath = join(env.STORAGE_LOCAL_DIR, ".docker-smoke-info");
if (
  new URL(env.DATABASE_URL).pathname !== "/brokermogger_smoke_test" ||
  env.APP_ENV !== "staging" ||
  env.EMAIL_PROVIDER !== "mock" ||
  env.ALLOW_EXTERNAL_SENDING ||
  env.STORAGE_BACKEND !== "local" ||
  env.STORAGE_LOCAL_DIR !== "/data/objects"
)
  throw new Error(
    "Docker smoke verification requires its disposable local database and disabled external sending."
  );

async function main() {
  if (command === "prepare") {
    const id = randomUUID();
    await prisma.user.create({
      data: { id, ...encryptedAccountEmail(id, "smoke@example.org"), timezone: "UTC" },
    });
    const actor: ActorContext = {
      ...systemActor("docker-smoke"),
      isSystem: false,
      role: "USER",
      userId: id,
    };
    const profileId = randomUUID();
    await prisma.userProfile.create({
      data: {
        id: profileId,
        ownerUserId: id,
        kind: "SELF",
        consentStatus: "SELF",
        ...encryptedProfileFields(profileId, {
          displayName: "Synthetic smoke profile",
          legalName: "Alex Smoke",
          contactEmail: "smoke@example.org",
          countryCode: "DE",
          region: null,
          residencyConfirmed: true,
        }),
      },
    });
    const sessionToken = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: { userId: id, sessionToken, expires: new Date(Date.now() + 3600_000) },
    });
    const file = await storePrivateFile(actor, {
      userId: id,
      profileId,
      requestId: null,
      kind: "OTHER",
      filename: "résumé privé.pdf",
      contentType: "application/pdf",
      body: Buffer.from("%PDF-1.7\nSynthetic Docker evidence\n%%EOF"),
      expiresAt: null,
    });
    const today = new Date().toISOString().slice(0, 10);
    const report = await requestReport(actor, {
      profileId,
      dateFrom: today,
      dateTo: today,
      format: "PDF",
      submissionKey: randomUUID(),
    });
    const data = await requestAccountExport(actor, {
      mode: "MASKED",
      confirmationAccepted: false,
      submissionKey: randomUUID(),
    });
    const sensitive = await requestAccountExport(actor, {
      mode: "SENSITIVE",
      confirmationAccepted: true,
      submissionKey: randomUUID(),
    });
    await writeFile(
      infoPath,
      JSON.stringify({
        evidenceId: file.id,
        reportId: report.id,
        exportId: data.id,
        sensitiveExportId: sensitive.id,
        userId: id,
        sessionToken,
      }),
      { mode: 0o600 }
    );
    process.stdout.write("Synthetic evidence, report and export queued.\n");
    return;
  }
  const info = infoSchema.parse(JSON.parse(await readFile(infoPath, "utf8")));
  if (command === "wait") {
    const until = Date.now() + 120_000;
    while (Date.now() < until) {
      const [report, data, sensitive] = await Promise.all([
        prisma.report.findUniqueOrThrow({ where: { id: info.reportId } }),
        prisma.accountExport.findUniqueOrThrow({ where: { id: info.exportId } }),
        prisma.accountExport.findUniqueOrThrow({ where: { id: info.sensitiveExportId } }),
      ]);
      if ([report, data, sensitive].some((record) => record.status === "FAILED"))
        throw new Error("Docker background generation failed.");
      if ([report, data, sensitive].every((record) => record.status === "READY")) {
        process.stdout.write("Docker worker completed report and export generation.\n");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Docker worker generation timed out.");
  }
  const files = await prisma.evidenceFile.findMany({
    where: { userId: info.userId, storageState: "READY" },
  });
  if (files.length !== 4) throw new Error("Docker generated files are incomplete.");
  for (const file of files) {
    const bytes = await getStorage(file.storageBackend).get(file.storageKey);
    if (
      bytes.subarray(0, 4).toString("ascii") !== "bmf1" ||
      sha256Hex(bytes) === file.checksumSha256
    )
      throw new Error("A Docker private object is not encrypted.");
  }
  if (await prisma.outboundEmail.count())
    throw new Error("Docker smoke verification must not create outbound broker email.");
  process.stdout.write(
    "Docker shared storage, encrypted objects and worker runtime checks passed.\n"
  );
}
main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    createLogger("docker.smoke").error(
      { err: error, command },
      "Docker smoke verification failed."
    );
    process.exitCode = 1;
  });
