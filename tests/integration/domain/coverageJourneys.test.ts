import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { GDPR_COUNTRIES } from "@/lib/jurisdiction/eea";
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

afterEach(clearMemoryStorage);

describe("sourced coverage journeys", () => {
  it("completes every initial GDPR country/type through approval, manual submission, confirmed response and report", async () => {
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
      where: { code: { in: GDPR_COUNTRIES.map((country) => country.code) } },
    });
    const jurisdictionIds = new Map(jurisdictions.map((row) => [row.code, row.id]));
    await testPrisma.brokerJurisdictionCoverage.createMany({
      data: jurisdictions
        .filter((row) => row.code !== "DE")
        .map((row) => ({ brokerId: f.brokers[0]!.id, jurisdictionId: row.id })),
    });
    const today = new Date().toISOString().slice(0, 10);
    const completed: string[] = [];
    for (const country of GDPR_COUNTRIES) {
      await updateOwnedProfile(f.actor, f.profile.id, {
        displayName: "My profile",
        legalName: "Alex Sample",
        contactEmail: "alex@example.org",
        countryCode: country.code,
        region: null,
        residencyConfirmed: true,
      });
      const types = [
        ...new Set(
          LEGAL_RULES.filter((rule) => rule.jurisdictionCode === country.code).flatMap(
            (rule) => rule.versions[0]!.supportedRequestTypes
          )
        ),
      ].filter((type) => !["FOLLOW_UP", "FINAL_REMINDER", "ESCALATION"].includes(type));
      for (const requestType of types) {
        const {
          requestIds: [id],
        } = await generateRequests(f.actor, { ...f.input, requestType });
        const request = await getOwnedRequest(f.actor, id!);
        expect(request.jurisdictionId).toBe(jurisdictionIds.get(country.code));
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
        expect(result.deadlineIsEstimate).toBe(true); // No invented national holiday calendars.
        completed.push(id!);
      }
    }
    expect(completed).toHaveLength(210);
    const report = await requestReport(f.actor, {
      profileId: f.profile.id,
      dateFrom: today,
      dateTo: today,
      format: "JSON",
      submissionKey: randomUUID(),
    });
    const [job] = await claimDueJobs("coverage-report", 1);
    expect(job?.type).toBe("GENERATE_REPORT");
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
  }, 180_000);
});
