import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  requestReport,
  renderReportForJob,
  downloadReport,
  changeReportJob,
  listReports,
} from "@/lib/reports/service";
import {
  beginReportGeneration,
  publishReportFile,
} from "@/lib/db/repositories/reportGeneration";
import { claimDueJobs, expireStaleLocks } from "@/lib/db/repositories/jobs";
import { markAccountDeletionRequested } from "@/lib/db/repositories/account";
import { softDeleteProfile } from "@/lib/db/repositories/profiles";
import { generateRequests, approveRequest } from "@/lib/requests/lifecycle";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { createJobHandlers } from "@/lib/jobs/handlers";
import { getStorage, clearMemoryStorage } from "@/lib/storage";
import { downloadEvidence } from "@/lib/evidence/service";
import { runClaimedJob } from "@/lib/jobs/queue";
import type { ClaimedJob } from "@/lib/jobs/types";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

afterEach(() => {
  vi.restoreAllMocks();
  clearMemoryStorage();
});
const input = () => ({
  profileId: null,
  dateFrom: "2026-01-01",
  dateTo: "2026-12-31",
  format: "JSON",
  submissionKey: randomUUID(),
});
async function claim() {
  const [job] = await claimDueJobs("report-test", 1);
  expect(job?.type).toBe("GENERATE_REPORT");
  return job as ClaimedJob<"GENERATE_REPORT">;
}
async function fixture() {
  const f = await workflowFixture();
  await generateRequests(f.actor, f.input);
  const request = await testPrisma.removalRequest.findFirstOrThrow({
    where: { userId: f.user.id },
  });
  return { ...f, request };
}

describe("private, complete and recoverable reports", () => {
  it.each(["MOCK", "SANDBOX", "RESEND"] as const)(
    "counts %s acceptance according to whether it contacts the broker",
    async (provider) => {
      const f = await fixture();
      const request = await getOwnedRequest(f.actor, f.request.id);
      await approveRequest(f.actor, {
        requestId: request.id,
        envelopeHash: request.snapshots[0]!.envelopeHash,
        confirmationAccepted: true,
      });
      const [send] = await claimDueJobs("report-submission", 1);
      await runClaimedJob(send!, createJobHandlers());
      await testPrisma.outboundEmail.updateMany({
        where: { removalRequestId: request.id },
        data: { provider },
      });
      const report = await requestReport(f.actor, input());
      await renderReportForJob(await claim());
      const data = JSON.parse((await downloadReport(f.actor, report.id)).body.toString());
      expect(data.brokersContacted).toEqual(
        provider === "RESEND" ? [f.brokers[0]!.legalName] : []
      );
    }
  );
  it("creates the report and job atomically, deduplicates submits and rejects changed inputs", async () => {
    const f = await fixture();
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_report_job_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected report job failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_report_job_failure BEFORE INSERT ON "BackgroundJob" FOR EACH ROW EXECUTE FUNCTION test_report_job_failure()`
    );
    try {
      await expect(requestReport(f.actor, input())).rejects.toThrow();
      expect(await testPrisma.report.count()).toBe(0);
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_report_job_failure ON "BackgroundJob"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_report_job_failure()`);
    }
    const command = input();
    const results = await Promise.all([
      requestReport(f.actor, command),
      requestReport(f.actor, command),
    ]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(await testPrisma.report.count()).toBe(1);
    expect(
      await testPrisma.backgroundJob.count({ where: { type: "GENERATE_REPORT" } })
    ).toBe(1);
    await expect(
      requestReport(f.actor, { ...command, format: "PDF" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("includes the whole account-local end date, excluding both neighboring days", async () => {
    const f = await fixture();
    await testPrisma.user.update({
      where: { id: f.user.id },
      data: { timezone: "Europe/Berlin" },
    });
    await testPrisma.removalRequest.update({
      where: { id: f.request.id },
      data: { createdAt: new Date("2026-03-29T21:59:59.999Z") },
    });
    await testPrisma.removalRequest.createMany({
      data: ["2026-03-28T22:59:59.999Z", "2026-03-29T22:00:00.000Z"].map((date) => ({
        userId: f.user.id,
        profileId: f.profile.id,
        brokerId: f.brokers[0]!.id,
        jurisdictionId: f.request.jurisdictionId,
        requestType: "DELETION",
        channel: "EMAIL",
        status: "CLOSED",
        legalBasisText: "Historic",
        createdAt: new Date(date),
      })),
    });
    const report = await requestReport(f.actor, {
      ...input(),
      dateFrom: "2026-03-29",
      dateTo: "2026-03-29",
    });
    await renderReportForJob(await claim());
    const payload = JSON.parse(
      (await downloadReport(f.actor, report.id)).body.toString()
    );
    expect(payload.requests.map((row: { id: string }) => row.id)).toEqual([f.request.id]);
    expect(payload.timeZone).toBe("Europe/Berlin");
    expect(payload.brokersContacted).toEqual([]);
    expect(payload).not.toHaveProperty("legalName");
    expect(JSON.stringify(payload)).not.toContain("alex@example.org");
  });

  it("includes more than the former 10,000-row cap with bounded database pages", async () => {
    const f = await fixture();
    await testPrisma.removalRequest.createMany({
      data: Array.from({ length: 10_001 }, () => ({
        userId: f.user.id,
        profileId: f.profile.id,
        brokerId: f.brokers[0]!.id,
        jurisdictionId: f.request.jurisdictionId,
        requestType: "DELETION",
        channel: "EMAIL",
        status: "CLOSED",
        legalBasisText: "Historic",
        createdAt: new Date("2026-05-01"),
      })),
    });
    const report = await requestReport(f.actor, input());
    await renderReportForJob(await claim());
    const row = await testPrisma.report.findUniqueOrThrow({
      where: { id: report.id },
      include: { evidenceFile: true },
    });
    expect(row).toMatchObject({
      status: "READY",
      totalRequests: 10_002,
      processedRequests: 10_002,
    });
    const payload = JSON.parse(
      (await downloadReport(f.actor, report.id)).body.toString()
    );
    expect(payload.requests).toHaveLength(10_002);
    expect(new Set(payload.requests.map((item: { id: string }) => item.id)).size).toBe(
      10_002
    );
    expect(payload.truncated).toBe(false);
    const stored = await getStorage().get(row.evidenceFile!.storageKey);
    expect(stored.subarray(0, 4).toString()).toBe("bmf1");
    expect(stored.includes(Buffer.from("privacy request report"))).toBe(false);
  }, 60_000);

  it("checks actual profile ownership and refuses foreign downloads and mutations, including privileged accounts", async () => {
    const f = await fixture();
    const other = await workflowFixture();
    const admin = testActor(other.user.id, "INSTANCE_ADMIN", {
      adminGrant: {
        adminActionId: "grant",
        scope: `user:${f.user.id}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(
      requestReport(admin, { ...input(), profileId: f.profile.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const report = await requestReport(f.actor, input());
    await renderReportForJob(await claim());
    expect((await listReports(admin)).items).toHaveLength(0);
    await expect(downloadReport(admin, report.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      changeReportJob(admin, { id: report.id, operation: "cancel" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an expired worker and leaves cancellation authoritative during storage", async () => {
    const f = await fixture();
    const report = await requestReport(f.actor, input());
    const stale = await claim();
    await beginReportGeneration(stale);
    await testPrisma.backgroundJob.update({
      where: { id: stale.id },
      data: { lockExpiresAt: new Date(0) },
    });
    await expireStaleLocks();
    const current = await claim();
    expect(
      await publishReportFile(stale, "unused", {
        requests: 1,
        brokers: 0,
        openActions: 1,
      })
    ).toBe(false);
    const storage = getStorage();
    const put = storage.put.bind(storage);
    vi.spyOn(storage, "put").mockImplementationOnce(async (object) => {
      const file = await testPrisma.evidenceFile.findUniqueOrThrow({
        where: { storageKey: object.key },
      });
      await expect(downloadEvidence(f.actor, file.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await changeReportJob(f.actor, { id: report.id, operation: "cancel" });
      return put(object);
    });
    await renderReportForJob(current);
    const row = await testPrisma.report.findUniqueOrThrow({ where: { id: report.id } });
    expect(row).toMatchObject({
      status: "FAILED",
      evidenceFileId: null,
      generationLeaseToken: null,
    });
    expect(
      await testPrisma.evidenceFile.count({ where: { storageState: "PURGED" } })
    ).toBe(1);
    expect(await testPrisma.notification.count({ where: { type: "REPORT_READY" } })).toBe(
      0
    );
  });

  it("recovers a failed generation and produces a downloadable PDF on explicit retry", async () => {
    const f = await fixture();
    const report = await requestReport(f.actor, { ...input(), format: "PDF" });
    await testPrisma.backgroundJob.updateMany({
      where: { type: "GENERATE_REPORT" },
      data: { maxAttempts: 1 },
    });
    vi.spyOn(getStorage(), "put").mockRejectedValueOnce(
      new Error("Injected storage failure")
    );
    await runClaimedJob(await claim(), { GENERATE_REPORT: renderReportForJob });
    expect((await listReports(f.actor)).items[0]).toMatchObject({
      status: "FAILED",
      job: { status: "FAILED" },
    });
    await Promise.all([
      changeReportJob(f.actor, { id: report.id, operation: "retry" }),
      changeReportJob(f.actor, { id: report.id, operation: "retry" }),
    ]);
    const job = await claim();
    await Promise.all([renderReportForJob(job), renderReportForJob(job)]);
    const downloaded = await downloadReport(f.actor, report.id);
    expect(downloaded.body.subarray(0, 4).toString()).toBe("%PDF");
    expect(downloaded.filename).toMatch(/\.pdf$/);
    expect(
      await testPrisma.evidenceFile.count({ where: { storageState: "READY" } })
    ).toBe(1);
    expect(await testPrisma.notification.count({ where: { type: "REPORT_READY" } })).toBe(
      1
    );
  });

  it.each(["account", "profile"])(
    "cannot publish private content after %s erasure starts",
    async (kind) => {
      const f = await fixture();
      const report = await requestReport(f.actor, input());
      const job = await claim();
      const storage = getStorage();
      const put = storage.put.bind(storage);
      vi.spyOn(storage, "put").mockImplementationOnce(async (object) => {
        if (kind === "account") await markAccountDeletionRequested(f.actor);
        else await softDeleteProfile(f.actor, f.profile.id);
        return put(object);
      });
      await renderReportForJob(job);
      await expect(downloadReport(f.actor, report.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect(
        await testPrisma.evidenceFile.count({ where: { storageState: "READY" } })
      ).toBe(0);
    }
  );
});
