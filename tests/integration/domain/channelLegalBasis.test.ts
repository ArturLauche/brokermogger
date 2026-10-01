import { describe, expect, it } from "vitest";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { updateOwnedProfile } from "@/lib/db/repositories/profiles";
import { generateRequests, approveRequest } from "@/lib/requests/lifecycle";
import { recordManualSubmission } from "@/lib/requests/manual";
import { readApprovalEnvelope } from "@/lib/requests/envelope";
import { workflowFixture } from "../../helpers/workflow";
import { testPrisma } from "../../helpers/db";

async function california(contactType: "EMAIL" | "DROP_PLATFORM") {
  const f = await workflowFixture();
  await updateOwnedProfile(f.actor, f.profile.id, {
    displayName: "My profile",
    legalName: "Alex Sample",
    contactEmail: "alex@example.org",
    countryCode: "US",
    region: "CA",
    residencyConfirmed: true,
  });
  const jurisdiction = await testPrisma.jurisdiction.findUniqueOrThrow({
    where: { code: "US-CA" },
  });
  await testPrisma.brokerJurisdictionCoverage.create({
    data: { brokerId: f.brokers[0]!.id, jurisdictionId: jurisdiction.id },
  });
  await testPrisma.brokerContactMethod.updateMany({
    where: { brokerId: f.brokers[0]!.id },
    data: {
      type: contactType,
      value:
        contactType === "EMAIL"
          ? "privacy@example.org"
          : "https://consumer.drop.privacy.ca.gov/",
    },
  });
  return f;
}

describe("channel-specific legal basis", () => {
  it("does not turn a direct suppression email into a DROP submission", async () => {
    const f = await california("EMAIL");
    const {
      requestIds: [id],
    } = await generateRequests(f.actor, { ...f.input, requestType: "SUPPRESSION" });
    const request = await getOwnedRequest(f.actor, id!);
    expect(request.legalBasisText).toMatch(/voluntary.*suppression/i);
    expect(request.snapshots[0]!.body).not.toContain("California Delete Act");
    expect(request.channel).toBe("EMAIL");
  });

  it("uses approved DROP instructions for manual deletion without an invented 45-day response clock", async () => {
    const f = await california("DROP_PLATFORM");
    const {
      requestIds: [id],
    } = await generateRequests(f.actor, f.input);
    const request = await getOwnedRequest(f.actor, id!);
    expect(request.legalBasisText).toContain("California Delete Act");
    expect(readApprovalEnvelope(request.snapshots[0]!).channel).toBe("DROP");
    expect(request.snapshots[0]!.body).toContain("DROP ID");
    expect(request.snapshots[0]!.body).toMatch(/not submitted/i);
    await approveRequest(f.actor, {
      requestId: id,
      envelopeHash: request.snapshots[0]!.envelopeHash,
      confirmationAccepted: true,
    });
    await recordManualSubmission(f.actor, {
      requestId: id,
      snapshotId: request.currentSnapshotId,
      submittedOn: new Date().toISOString().slice(0, 10),
      receivedOn: null,
      evidenceFileId: null,
      confirmationAccepted: true,
    });
    const submitted = await getOwnedRequest(f.actor, id!);
    expect(submitted.status).toBe("WAITING_FOR_BROKER");
    expect(submitted.deadlineAt).toBeNull();
    expect(await testPrisma.outboundEmail.count()).toBe(0);
  });

  it("rejects a DROP contact for a different state's ordinary statutory letter", async () => {
    const f = await california("DROP_PLATFORM");
    await updateOwnedProfile(f.actor, f.profile.id, {
      displayName: "My profile",
      legalName: "Alex Sample",
      contactEmail: "alex@example.org",
      countryCode: "US",
      region: "CO",
      residencyConfirmed: true,
    });
    await expect(generateRequests(f.actor, f.input)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(await testPrisma.removalRequest.count()).toBe(0);
    expect(await testPrisma.rateLimitBucket.count()).toBe(0);
  });
});
