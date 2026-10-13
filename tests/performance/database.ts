/** Reproducible synthetic measurements. This command never uses an instance schema. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { env } from "@/lib/config/env";
import { encryptedAccountEmail } from "@/lib/security/accountEmail";
import { encryptField, chainHash, canonicalJson, sha256Hex } from "@/lib/security/crypto";
import { encryptSnapshotText } from "@/lib/requests/snapshot";
import { auditCanonicalPayload, AuditChainVerifier } from "@/lib/audit/hash";
import type { ClaimedJob, JobHandlerRegistry } from "@/lib/jobs/types";
import { clearMemoryStorage } from "@/lib/storage/memory";
import { testActor } from "../helpers/actor";

const mode = process.argv[2] ?? "baseline";
assert(["baseline", "optimized", "report-index", "artifacts"].includes(mode));
const url = new URL(env.DATABASE_URL);
const schema = url.searchParams.get("schema") ?? "";
assert(/_test$/.test(url.pathname), "A dedicated test database is required.");
assert(
  /^bm_benchmark_[a-z0-9_]+$/.test(schema),
  "A new bm_benchmark_ schema is required."
);
assert(env.isTest && !env.isProduction && !env.ALLOW_EXTERNAL_SENDING);
assert.equal(env.EMAIL_PROVIDER, "mock");
assert.equal(env.STORAGE_BACKEND, "memory");

const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
let queries = 0;
let listSql: { query: string; params: string } | undefined;
db.$on("query", (event) => {
  queries += 1;
  // Keep parameter values in memory solely for the isolated EXPLAIN experiment.
  // Neither SQL nor parameters are written to the measurement artifact.
  if (/SELECT.*FROM.*"RemovalRequest"/s.test(event.query) && /ORDER BY/.test(event.query))
    listSql = { query: event.query, params: event.params };
});
(globalThis as unknown as { brokermoggerPrisma: PrismaClient }).brokermoggerPrisma = db;

type Sample = {
  fixtureCount: number;
  name: string;
  round: number;
  elapsedMs: number;
  queries: number;
  resultBytes: number;
  startingRssBytes: number;
  peakRssBytes: number;
  heapDeltaBytes: number;
};
const samples: Sample[] = [];
const workerSamples: object[] = [];
const plans: object[] = [];
let ownsSchema = false;
const outputPath = `.tmp/benchmarks/database-${mode}.json`;

function bytes(value: unknown) {
  if (Buffer.isBuffer(value)) return value.byteLength;
  return Buffer.byteLength(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item
    )
  );
}
async function measure(
  fixtureCount: number,
  name: string,
  round: number,
  iterations: number,
  operation: () => Promise<unknown>
) {
  await operation(); // Warm the query engine and relevant PostgreSQL buffers.
  globalThis.gc?.();
  for (let iteration = 0; iteration < iterations; iteration++) {
    const before = process.memoryUsage();
    let peak = before.rss;
    const timer = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 5);
    const queryStart = queries;
    const start = performance.now();
    try {
      const result = await operation();
      const resultBytes = bytes(result);
      const after = process.memoryUsage();
      samples.push({
        fixtureCount,
        name,
        round,
        elapsedMs: performance.now() - start,
        queries: queries - queryStart,
        resultBytes,
        startingRssBytes: before.rss,
        peakRssBytes: Math.max(peak, after.rss),
        heapDeltaBytes: after.heapUsed - before.heapUsed,
      });
    } finally {
      clearInterval(timer);
    }
  }
}

async function resetFixture() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = ${schema}
      AND tablename NOT LIKE '_prisma%'
  `;
  assert(tables.every(({ tablename }) => /^[A-Za-z0-9_]+$/.test(tablename)));
  const names = tables.map(({ tablename }) => `"${schema}"."${tablename}"`).join(",");
  await db.$transaction([
    db.$executeRaw`SELECT set_config('brokermogger.allow_append_only_delete', 'on', true)`,
    db.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`),
  ]);
  clearMemoryStorage();
}
async function createFixture(count: number) {
  await resetFixture();
  const userId = "benchmark-owner";
  const foreignId = "benchmark-foreign";
  await db.user.createMany({
    data: [userId, foreignId].map((id) => ({
      id,
      ...encryptedAccountEmail(id, `${id}@example.org`),
      timezone: "UTC",
    })),
  });
  const profileId = "benchmark-profile";
  const foreignProfileId = "benchmark-foreign-profile";
  await db.userProfile.createMany({
    data: [profileId, foreignProfileId].map((id) => ({
      id,
      ownerUserId: id === profileId ? userId : foreignId,
      kind: "SELF",
      consentStatus: "SELF",
      displayName: "Synthetic workspace",
      countryCode: "DE",
      residencyConfirmed: true,
      legalNameEnc: encryptField("Synthetic Benchmark", {
        table: "UserProfile",
        column: "legalNameEnc",
        recordId: id,
      }),
    })),
  });
  await db.broker.create({
    data: {
      id: "benchmark-broker",
      slug: "benchmark",
      legalName: "Synthetic benchmark broker",
      category: "PEOPLE_SEARCH",
      isDemoData: true,
      productionSendingEnabled: false,
    },
  });
  await db.jurisdiction.create({
    data: {
      id: "benchmark-jurisdiction",
      code: "DE",
      name: "Synthetic Germany",
      countryCode: "DE",
    },
  });
  const subject = "Synthetic private benchmark message";
  const body = "Synthetic private benchmark text. ".repeat(48);
  const contentHash = sha256Hex(`${subject}\n${body}`);
  for (let offset = 0; offset < count; offset += 250) {
    const rows: Prisma.RemovalRequestCreateManyInput[] = [];
    const snapshots: Prisma.RequestSnapshotCreateManyInput[] = [];
    for (let index = offset; index < Math.min(offset + 250, count); index++) {
      const id = `benchmark-request-${String(index).padStart(5, "0")}`;
      const createdAt = new Date(Date.UTC(2026, 8, 15) + index * 1000);
      const snapshotId = `benchmark-snapshot-${index}`;
      rows.push({
        id,
        userId,
        profileId,
        brokerId: "benchmark-broker",
        jurisdictionId: "benchmark-jurisdiction",
        requestType: "DELETION",
        channel: "WEB_FORM",
        status: "COMPLETED",
        legalBasisText: "Synthetic source for performance measurement only.",
        currentSnapshotId: snapshotId,
        createdAt,
      });
      rows.push({
        ...rows.at(-1)!,
        id: `foreign-request-${index}`,
        userId: foreignId,
        profileId: foreignProfileId,
        currentSnapshotId: null,
      });
      snapshots.push({
        id: snapshotId,
        removalRequestId: id,
        version: 1,
        subject: "",
        body: "",
        payloadEnc: encryptSnapshotText(snapshotId, subject, body),
        contentHash,
        identifierDigest: "synthetic",
        createdAt,
      });
    }
    await db.removalRequest.createMany({ data: rows });
    await db.requestSnapshot.createMany({ data: snapshots });
  }
  // Stress one long-lived request as well as the account's ordinary request list.
  const detailId = `benchmark-request-${String(count - 1).padStart(5, "0")}`;
  let previousEventHash: string | null = null;
  let previousAuditHash: string | null = null;
  for (let offset = 0; offset < count; offset += 250) {
    const events: Prisma.RemovalRequestEventCreateManyInput[] = [];
    const audits: Prisma.AuditLogCreateManyInput[] = [];
    for (let index = offset; index < Math.min(offset + 250, count); index++) {
      const createdAt = new Date(Date.UTC(2026, 8, 15) + index);
      const event = {
        removalRequestId: detailId,
        type: "NOTE" as const,
        fromStatus: "COMPLETED" as const,
        toStatus: "COMPLETED" as const,
        actorType: "USER" as const,
        actorUserId: userId,
        message: "Synthetic historical note",
        payload: {},
        createdAt,
      };
      const hash = chainHash(previousEventHash, canonicalJson(event));
      events.push({ ...event, prevHash: previousEventHash, hash });
      previousEventHash = hash;
      const audit = {
        action: "request.created",
        resourceType: "removal_request",
        resourceId: `benchmark-request-${String(index).padStart(5, "0")}`,
        actorUserId: userId,
        targetUserId: userId,
        outcome: "SUCCESS" as const,
        createdAt,
        metadata: { synthetic: true, fixture: index },
      };
      const auditHash = chainHash(previousAuditHash, auditCanonicalPayload(audit));
      audits.push({
        ...audit,
        actorType: "USER",
        actorRole: "USER",
        prevHash: previousAuditHash,
        hash: auditHash,
      });
      previousAuditHash = auditHash;
    }
    await db.removalRequestEvent.createMany({ data: events });
    await db.auditLog.createMany({ data: audits });
  }
  await db.$executeRawUnsafe(`ANALYZE "${schema}"."RemovalRequest"`);
  await db.$executeRawUnsafe(`ANALYZE "${schema}"."RequestSnapshot"`);
  return { userId, profileId, detailId, actor: testActor(userId) };
}

async function main() {
  // CREATE succeeds only for a new schema, which this process then owns and removes.
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  ownsSchema = true;
  execFileSync(
    process.execPath,
    [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
    { stdio: "pipe", timeout: 120000 }
  );
  const { prisma } = await import("@/lib/db/client");
  assert.equal(prisma, db, "Instrumentation must cover the actual repository client.");
  const { listOwnedRequests, getOwnedRequest } =
    await import("@/lib/db/repositories/requests");
  const { listRequestEvents } = await import("@/lib/db/repositories/requestHistory");
  const { listAuditChainWindow } = await import("@/lib/db/repositories/audit");
  const { scanAuditChain } = await import("@/lib/db/repositories/auditVerification");
  const { claimDueJobs, markJobCompleted } = await import("@/lib/db/repositories/jobs");
  const { processOnce, runClaimedJob } = await import("@/lib/jobs/queue");
  const { requestReport, renderReportForJob, downloadReport } =
    await import("@/lib/reports/service");
  const { exportMaskedAccount } = await import("@/lib/exports/service");
  const server = await db.$queryRaw<{ version: string }[]>`SELECT version()`;
  for (const count of mode === "report-index" ? [10000] : [100, 1000, 10000]) {
    const fixture = await createFixture(count);
    const { actor, userId, profileId, detailId } = fixture;
    const completeReport = async (format: "JSON" | "PDF" = "JSON") => {
      const report = await requestReport(actor, {
        profileId,
        dateFrom: "2026-09-01",
        dateTo: "2026-09-30",
        format,
        submissionKey: randomUUID(),
      });
      const [job] = await claimDueJobs("benchmark-report", 1);
      assert(job?.type === "GENERATE_REPORT");
      await runClaimedJob(job, { GENERATE_REPORT: renderReportForJob });
      const result = await downloadReport(actor, report.id);
      if (format === "JSON")
        assert.equal(JSON.parse(result.body.toString()).requests.length, count);
      else {
        assert(result.body.subarray(0, 5).equals(Buffer.from("%PDF-")));
        const stored = await db.report.findUniqueOrThrow({
          where: { id: report.id },
          select: { status: true, processedRequests: true },
        });
        assert.equal(stored.status, "READY");
        assert.equal(stored.processedRequests, count);
      }
      clearMemoryStorage();
      return result.body;
    };
    if (mode === "artifacts") {
      for (let round = 0; round < 3; round++) {
        await measure(count, "complete-json-report", round, 3, completeReport);
        await measure(count, "complete-pdf-report", round, 3, () =>
          completeReport("PDF")
        );
      }
      assert.equal(await db.outboundEmail.count(), 0);
      process.stdout.write(
        `Measured encrypted JSON/PDF generation and authenticated downloads for ${count} requests.\n`
      );
      continue;
    }
    if (mode === "report-index") {
      const configurations = ["none", "page", "export"] as const;
      for (let round = 0; round < 3; round++) {
        for (let offset = 0; offset < configurations.length; offset++) {
          const configuration = configurations[(offset + round) % configurations.length]!;
          await db.$executeRawUnsafe(
            `DROP INDEX IF EXISTS "${schema}"."RemovalRequest_userId_createdAt_id_idx"`
          );
          await db.$executeRawUnsafe(
            `DROP INDEX IF EXISTS "${schema}"."benchmark_request_export_idx"`
          );
          if (configuration === "page")
            await db.$executeRawUnsafe(
              `CREATE INDEX "RemovalRequest_userId_createdAt_id_idx" ON "${schema}"."RemovalRequest" ("userId", "createdAt", id)`
            );
          if (configuration === "export")
            await db.$executeRawUnsafe(
              `CREATE INDEX "benchmark_request_export_idx" ON "${schema}"."RemovalRequest" ("userId", id)`
            );
          await measure(count, `report-index-${configuration}`, round, 3, completeReport);
        }
      }
      assert.equal(await db.outboundEmail.count(), 0);
      process.stdout.write(
        "Measured complete reports with counterbalanced index choices.\n"
      );
      continue;
    }
    const deepDate = new Date(Date.UTC(2026, 8, 15) + Math.floor(count * 0.1) * 1000);
    const cursor = Buffer.from(
      JSON.stringify({
        id: `benchmark-request-${String(Math.floor(count * 0.1)).padStart(5, "0")}`,
        createdAt: deepDate.toISOString(),
      })
    ).toString("base64url");
    const legacyList = () =>
      db.removalRequest.findMany({
        where: { userId, profileId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { broker: true, profile: true },
      });
    const legacyDetail = () =>
      db.removalRequest.findFirstOrThrow({
        where: { id: detailId, userId },
        include: {
          broker: true,
          profile: true,
          snapshots: { orderBy: { version: "desc" }, take: 1 },
          events: { orderBy: { createdAt: "asc" } },
        },
      });
    for (let round = 0; round < 3; round++) {
      await measure(count, "legacy-list-100", round, 20, legacyList);
      await measure(count, "projected-list-100", round, 20, async () => {
        const page = await listOwnedRequests(actor, profileId, { limit: 100 });
        assert.equal(page.total, count);
        return page;
      });
      await measure(count, "list-25", round, 20, () =>
        listOwnedRequests(actor, profileId)
      );
      await measure(count, "deep-list-25", round, 20, () =>
        listOwnedRequests(actor, profileId, { cursor })
      );
      await measure(count, "legacy-unbounded-history", round, 5, legacyDetail);
      await measure(count, "private-detail-with-history-25", round, 5, async () => {
        const [request, history] = await Promise.all([
          getOwnedRequest(actor, detailId),
          listRequestEvents(actor, detailId),
        ]);
        assert.equal(history.total, count);
        return { request, history };
      });
    }
    // Compare the same real page query with and without a candidate index, locally only.
    await db.$executeRawUnsafe(
      `DROP INDEX IF EXISTS "${schema}"."RemovalRequest_userId_createdAt_id_idx"`
    );
    for (let round = 0; round < 3; round++) {
      for (const indexed of round % 2 ? [true, false] : [false, true]) {
        await db.$executeRawUnsafe(
          `DROP INDEX IF EXISTS "${schema}"."benchmark_request_page_idx"`
        );
        if (indexed)
          await db.$executeRawUnsafe(
            `CREATE INDEX "benchmark_request_page_idx" ON "${schema}"."RemovalRequest" ("userId", "createdAt", id)`
          );
        await measure(
          count,
          `index-experiment-${indexed ? "on" : "off"}`,
          round,
          20,
          () => listOwnedRequests(actor, profileId, { cursor })
        );
        assert(listSql);
        const explain = await db.$queryRawUnsafe<
          {
            "QUERY PLAN": {
              "Execution Time": number;
              "Planning Time": number;
              Plan: unknown;
            }[];
          }[]
        >(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${listSql.query}`,
          ...(JSON.parse(listSql.params) as unknown[]).map((value) =>
            typeof value === "string" && /^\d{4}-\d\d-\d\d[ T]/.test(value)
              ? new Date(value)
              : value
          )
        );
        const result = explain[0]?.["QUERY PLAN"][0];
        assert(result);
        const nodes: { type: string; index?: string; rows: number; removed: number }[] =
          [];
        const visit = (raw: unknown) => {
          const node = raw as Record<string, unknown>;
          nodes.push({
            type: String(node["Node Type"]),
            ...(typeof node["Index Name"] === "string"
              ? { index: node["Index Name"] }
              : {}),
            rows: Number(node["Actual Rows"] ?? 0),
            removed: Number(node["Rows Removed by Filter"] ?? 0),
          });
          for (const child of (node.Plans ?? []) as unknown[]) visit(child);
        };
        visit(result.Plan);
        plans.push({
          fixtureCount: count,
          round,
          indexed,
          executionMs: result["Execution Time"],
          planningMs: result["Planning Time"],
          nodes,
        });
      }
    }
    await db.$executeRawUnsafe(
      `DROP INDEX IF EXISTS "${schema}"."benchmark_request_page_idx"`
    );
    if (mode === "optimized")
      await db.$executeRawUnsafe(
        `CREATE INDEX "RemovalRequest_userId_createdAt_id_idx" ON "${schema}"."RemovalRequest" ("userId", "createdAt", id)`
      );
    const auditRow = await db.backgroundJob.create({
      data: {
        type: "VERIFY_AUDIT_CHAIN",
        payloadJson: {},
        idempotencyKey: `audit:${count}`,
        status: "RUNNING",
        leaseToken: randomUUID(),
        lockedBy: "benchmark",
        lockedAt: new Date(),
        lockExpiresAt: new Date(Date.now() + 3600000),
        attemptCount: 1,
      },
    });
    const auditJob = {
      id: auditRow.id,
      leaseToken: auditRow.leaseToken!,
      type: "VERIFY_AUDIT_CHAIN",
      payload: {},
      idempotencyKey: auditRow.idempotencyKey,
      attemptCount: 1,
      maxAttempts: 5,
      relatedUserId: null,
      relatedRequestId: null,
    } satisfies ClaimedJob<"VERIFY_AUDIT_CHAIN">;
    for (let round = 0; round < 3; round++) {
      await measure(count, "audit-unbounded-read-and-verify", round, 3, async () => {
        const window = await listAuditChainWindow();
        const verifier = new AuditChainVerifier(null);
        assert(verifier.consume(window.rows));
        assert.equal(verifier.checkedCount, count);
        return { checkedCount: verifier.checkedCount };
      });
      await measure(count, "audit-paged-stable-snapshot", round, 3, async () => {
        const result = await scanAuditChain(auditJob);
        assert.equal(result?.isValid, true);
        assert.equal(result.checkedCount, count);
        return result;
      });
    }
    assert(
      await markJobCompleted(auditJob, { message: "Synthetic benchmark complete" }, 0)
    );
    for (let round = 0; round < 3; round++) {
      await measure(count, "complete-json-report", round, 3, completeReport);
      await measure(count, "complete-masked-account-export", round, 3, async () => {
        const body = await exportMaskedAccount(actor);
        const result = JSON.parse(body.toString());
        assert.equal(result.requests.length, count);
        assert.equal(result.snapshots.length, count);
        assert(!body.includes("Synthetic private benchmark text"));
        return body;
      });
    }
    for (let round = 0; round < 3; round++) {
      for (const concurrency of [1, 2, 4]) {
        await db.backgroundJob.createMany({
          data: Array.from({ length: 100 }, () => ({
            type: "RETENTION_SWEEP",
            payloadJson: { dryRun: true },
            idempotencyKey: randomUUID(),
            // PostgreSQL and the benchmark process can have a small clock skew.
            // These synthetic jobs are deliberately due before claiming starts.
            runAt: new Date(Date.now() - 60_000),
          })),
        });
        const completed: string[] = [];
        const handlers: JobHandlerRegistry = {
          RETENTION_SWEEP: async (job) => {
            assert(job.payload.dryRun);
            const page = await listOwnedRequests(actor, profileId);
            assert.equal(page.total, count);
            completed.push(job.id);
            return { message: "Synthetic bounded database-read job complete" };
          },
        };
        const before = process.memoryUsage();
        const queryStart = queries;
        const start = performance.now();
        await Promise.all(
          Array.from({ length: concurrency }, (_, index) =>
            (async () => {
              while (await processOnce(`benchmark-${index}`, handlers)) {
                /* Claim only when ready. */
              }
            })()
          )
        );
        const elapsedMs = performance.now() - start;
        assert.equal(completed.length, 100);
        assert.equal(new Set(completed).size, 100);
        assert.equal(
          await db.backgroundJob.count({
            where: { type: "RETENTION_SWEEP", status: "COMPLETED" },
          }),
          100
        );
        assert.equal(
          await db.backgroundJob.count({
            where: { status: { in: ["RUNNING", "FAILED", "RETRYABLE"] } },
          }),
          0
        );
        workerSamples.push({
          fixtureCount: count,
          round,
          concurrency,
          jobs: 100,
          elapsedMs,
          jobsPerSecond: 100000 / elapsedMs,
          queries: queries - queryStart,
          startingRssBytes: before.rss,
          rssBytes: process.memoryUsage().rss,
        });
        await db.backgroundJob.deleteMany({ where: { type: "RETENTION_SWEEP" } });
      }
    }
    assert.equal(await db.outboundEmail.count(), 0);
    assert.equal(await db.removalRequest.count({ where: { userId } }), count);
    process.stdout.write(
      `Measured ${count} owned requests and ${count} foreign requests.\n`
    );
  }
  const sources = [
    "tests/performance/database.ts",
    "lib/pagination.ts",
    "lib/db/repositories/requests.ts",
    "lib/db/repositories/requestHistory.ts",
    "lib/db/repositories/accountExportData.ts",
    "lib/reports/service.ts",
    "lib/exports/service.ts",
    "lib/db/repositories/auditVerification.ts",
    "lib/jobs/queue.ts",
    "prisma/schema.prisma",
  ];
  const sourceHash = createHash("sha256");
  for (const file of sources) sourceHash.update(file).update(readFileSync(file));
  mkdirSync(".tmp/benchmarks", { recursive: true });
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        mode,
        generatedAt: new Date().toISOString(),
        node: process.version,
        platform: process.platform,
        postgres: server[0]?.version,
        sourceHash: sourceHash.digest("hex"),
        notes: [
          "Synthetic test schema; mock delivery; zero outbound email.",
          "Database operation latency including serialization, not HTTP or user-perceived latency.",
          "Warm-query samples in three rounds; RSS sampled every 5ms and after operations, not a precise peak or leak test.",
          "Worker throughput uses actual claim/lease/finish paths with a synthetic bounded database-read handler; it does not predict provider, PDF or encryption throughput.",
          "Legacy reference reads reproduce broad list and unbounded history patterns using the current schema; they are not a complete build of the old application.",
          "Report/export samples exercise full generation, encryption/publication/download and verify all request records; no record cap is introduced.",
          "PDF samples verify the file signature and the complete processed-request count. They do not parse PDF text or predict external provider latency.",
        ],
        samples,
        workerSamples,
        plans,
      },
      null,
      2
    ) + "\n"
  );
  process.stdout.write(`Saved non-personal measurements to ${outputPath}.\n`);
}

main()
  .catch((error: unknown) => {
    mkdirSync(".tmp/benchmarks", { recursive: true });
    writeFileSync(
      ".tmp/benchmarks/database-error.txt",
      error instanceof Error
        ? (error.stack ?? error.message)
        : "Unknown benchmark failure"
    );
    process.stderr.write(
      "Benchmark failed. Details are in the ignored local error file.\n"
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    if (ownsSchema) await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
    clearMemoryStorage();
  });
