import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GDPR_COUNTRIES } from "@/lib/jurisdiction/eea";
import { US_PRIVACY_PACKS } from "@/lib/jurisdiction/us";
import { FUTURE_US_PRIVACY_PACKS } from "@/lib/jurisdiction/futureUs";
import { LEGAL_RULES } from "@/prisma/seeds/data/legal-rules";
import { updateOwnedProfile } from "@/lib/db/repositories/profiles";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { claimDueJobs } from "@/lib/db/repositories/jobs";
import { generateRequests, approveRequest } from "@/lib/requests/lifecycle";
import { recordManualSubmission } from "@/lib/requests/manual";
import { recordResponse, confirmResponse } from "@/lib/responses/service";
import { requestReport, renderReportForJob, downloadReport } from "@/lib/reports/service";
import { clearMemoryStorage } from "@/lib/storage";
import type { ClaimedJob } from "@/lib/jobs/types";
import { workflowFixture } from "../../helpers/workflow";
import { testPrisma } from "../../helpers/db";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  clearMemoryStorage();
});

describe("sourced coverage journeys", () => {
  it.each([
    {
      title: "all 30 GDPR countries and seven initial types",
      locations: GDPR_COUNTRIES.map((country) => ({
        code: country.code,
        countryCode: country.code,
        region: null as string | null,
      })),
      total: 210,
      estimated: true,
    },
    {
      title:
        "all 20 US states, voluntary suppression, unsupported-state requests and current India requests",
      locations: [
        { code: "US-CA", countryCode: "US", region: "CA" },
        ...US_PRIVACY_PACKS.map((pack) => ({
          code: `US-${pack.region}`,
          countryCode: "US",
          region: pack.region,
        })),
        { code: "US-OTHER", countryCode: "US", region: "DC" },
        { code: "IN", countryCode: "IN", region: null },
      ],
      total: 104,
      estimated: false,
    },
    {
      title: "the UK, Brazil, Australia and Singapore",
      locations: ["GB", "BR", "AU", "SG"].map((code) => ({
        code,
        countryCode: code,
        region: null,
      })),
      total: 24,
      estimated: true,
    },
    {
      title: "Alabama, Louisiana and Oklahoma current voluntary requests",
      locations: FUTURE_US_PRIVACY_PACKS.map((pack) => ({
        code: `US-${pack.region}`,
        countryCode: "US",
        region: pack.region,
      })),
      total: 6,
      estimated: true,
    },
    {
      title:
        "Alabama, Louisiana and Oklahoma voluntary requests after future commencement with statutory packs unpublished",
      locations: FUTURE_US_PRIVACY_PACKS.map((pack) => ({
        code: `US-${pack.region}`,
        countryCode: "US",
        region: pack.region,
      })),
      total: 6,
      estimated: true,
      futureClock: "2027-06-01T12:00:00Z",
    },
  ])(
    "completes $title through approval, submission, confirmed response and report",
    async (scenario) => {
      const { locations, total, estimated } = scenario;
      const futureCodes = FUTURE_US_PRIVACY_PACKS.map((pack) => `US-${pack.region}`);
      if ("futureClock" in scenario)
        // Even after every effective date, unpublished statutory drafts stay unavailable.
        vi.setSystemTime(new Date(scenario.futureClock));
      const f = await workflowFixture();
      await testPrisma.userQuota.upsert({
        where: { userId: f.user.id },
        create: {
          userId: f.user.id,
          requestsPerDay: 500,
          requestsPerMonth: 500,
          requestsPerBrokerPer30Days: 500,
        },
        update: {
          requestsPerDay: 500,
          requestsPerMonth: 500,
          requestsPerBrokerPer30Days: 500,
        },
      });
      await testPrisma.brokerContactMethod.updateMany({
        where: { brokerId: f.brokers[0]!.id },
        data: { type: "WEB_FORM", value: "https://example.org/privacy" },
      });
      const jurisdictions = await testPrisma.jurisdiction.findMany({
        where: { code: { in: locations.map((location) => location.code) } },
      });
      const jurisdictionIds = new Map(jurisdictions.map((row) => [row.code, row.id]));
      await testPrisma.brokerJurisdictionCoverage.createMany({
        data: jurisdictions
          .filter((row) => row.code !== "DE")
          .map((row) => ({ brokerId: f.brokers[0]!.id, jurisdictionId: row.id })),
      });
      const today = new Date().toISOString().slice(0, 10);
      const completed: string[] = [];
      for (const location of locations) {
        await updateOwnedProfile(f.actor, f.profile.id, {
          displayName: "My profile",
          legalName: "Alex Sample",
          contactEmail: "alex@example.org",
          countryCode: location.countryCode,
          region: location.region,
          residencyConfirmed: true,
        });
        const types = [
          ...new Set(
            LEGAL_RULES.filter((rule) => rule.jurisdictionCode === location.code).flatMap(
              (rule) =>
                [...rule.versions]
                  .filter(
                    (version) =>
                      version.status === "PUBLISHED" &&
                      new Date(version.effectiveFrom) <= new Date() &&
                      (!version.effectiveUntil ||
                        new Date(version.effectiveUntil) > new Date())
                  )
                  .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
                  ?.supportedRequestTypes ?? []
            )
          ),
        ].filter((type) => !["FOLLOW_UP", "FINAL_REMINDER", "ESCALATION"].includes(type));
        for (const requestType of types) {
          const {
            requestIds: [id],
          } = await generateRequests(f.actor, { ...f.input, requestType });
          const request = await getOwnedRequest(f.actor, id!);
          expect(request.jurisdictionId).toBe(jurisdictionIds.get(location.code));
          if (location.code === "IN" || futureCodes.includes(location.code))
            expect(request.legalBasisText).toContain("voluntary");
          expect(request.deadlineAt).toBeNull();
          await approveRequest(f.actor, {
            requestId: id,
            envelopeHash: request.snapshots[0]!.envelopeHash,
            confirmationAccepted: true,
          });
          await recordManualSubmission(f.actor, {
            requestId: id,
            snapshotId: request.currentSnapshotId,
            submittedOn: today,
            receivedOn: today,
            evidenceFileId: null,
            confirmationAccepted: true,
          });
          const response = await recordResponse(f.actor, {
            requestId: id,
            submissionKey: randomUUID(),
            receivedOn: today,
            channel: "WEB_FORM",
            fromAddress: "",
            subject: "Synthetic completion",
            body: "Your requested action has been completed.",
            evidenceFileId: null,
          });
          await confirmResponse(f.actor, {
            responseId: response.id,
            expectedRevision: 0,
            expectedRequestStatus: "WAITING_FOR_BROKER",
            classification: "CONFIRMED_COMPLETED",
            applyToRequest: true,
            confirmationAccepted: true,
          });
          const result = await getOwnedRequest(f.actor, id!);
          expect(result.status).toBe("COMPLETED");
          expect(result.deadlinePolicyVersion).toBe(1);
          expect(result.deadlineSnapshotId).toBe(request.currentSnapshotId);
          expect(result.deadlineIsEstimate, location.code).toBe(
            location.code === "BR" && requestType === "ACCESS"
              ? false
              : ["US-OTHER", "IN"].includes(location.code) ||
                  requestType === "SUPPRESSION" ||
                  (location.code === "US-CA" && requestType === "OPT_OUT")
                ? true
                : estimated
          );
          if (["US-OTHER", "IN", ...futureCodes].includes(location.code))
            expect(result.deadlineAt).toBeNull();
          if (["BR", "AU", "SG"].includes(location.code)) {
            expect(result.deadlineAt !== null).toBe(
              location.code === "BR" && requestType === "ACCESS"
            );
            if (location.code === "SG" && ["ACCESS", "CORRECTION"].includes(requestType))
              expect(result.deadlineNote).toMatch(/notif.*30|30.*notif/i);
          }
          completed.push(id!);
        }
      }
      expect(completed).toHaveLength(total);
      // PostgreSQL's now() is independent of Vitest's fixed legal-review clock.
      // Put these synthetic requests inside the same report day and cutoff.
      await testPrisma.removalRequest.updateMany({
        where: { id: { in: completed }, userId: f.user.id },
        data: { createdAt: new Date() },
      });
      const report = await requestReport(f.actor, {
        profileId: f.profile.id,
        dateFrom: today,
        dateTo: today,
        format: "JSON",
        submissionKey: randomUUID(),
      });
      // Prisma 7's driver adapter evaluates `BackgroundJob.runAt @default(now())`
      // with the application clock, which this suite freezes to a future legal
      // effective date. `claimDueJobs` compares against PostgreSQL `NOW()`, so
      // make the intended job due on the database clock before claiming it.
      await testPrisma.$executeRaw`
        UPDATE "BackgroundJob"
        SET "runAt" = NOW()
        WHERE "idempotencyKey" = ${`report:${report.id}`}
      `;
      const [job] = await claimDueJobs("coverage-report", 1);
      expect(job?.type).toBe("GENERATE_REPORT");
      expect(job?.payload).toMatchObject({ reportId: report.id });
      await renderReportForJob(job as ClaimedJob<"GENERATE_REPORT">);
      const data = JSON.parse((await downloadReport(f.actor, report.id)).body.toString());
      expect(data.requests).toHaveLength(completed.length);
      expect(new Set(data.requests.map((row: { id: string }) => row.id))).toEqual(
        new Set(completed)
      );
      expect(
        data.requests.every((row: { status: string }) => row.status === "COMPLETED")
      ).toBe(true);
      expect(await testPrisma.outboundEmail.count()).toBe(0);
    },
    180_000
  );
});
