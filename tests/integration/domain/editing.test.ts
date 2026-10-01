import { describe, expect, it } from "vitest";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { editRequestDraft, regenerateRequestDraft } from "@/lib/requests/editing";
import {
  approveRequest,
  generateRequests,
  returnRequestToDraft,
} from "@/lib/requests/lifecycle";
import { readSnapshotText } from "@/lib/requests/snapshot";
import { readApprovalEnvelope } from "@/lib/requests/envelope";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

async function draft() {
  const fixture = await workflowFixture();
  const result = await generateRequests(fixture.actor, fixture.input);
  const request = await getOwnedRequest(fixture.actor, result.requestIds[0]!);
  return { ...fixture, request, snapshot: request.snapshots[0]! };
}

describe("editable immutable drafts", () => {
  it("withdraws queued approval and saves edits without rewriting history", async () => {
    const fixture = await draft();
    await approveRequest(fixture.actor, {
      requestId: fixture.request.id,
      envelopeHash: fixture.snapshot.envelopeHash,
      confirmationAccepted: true,
    });
    await returnRequestToDraft(fixture.actor, fixture.request.id);
    expect((await testPrisma.backgroundJob.findFirstOrThrow()).status).toBe("CANCELLED");
    expect((await testPrisma.outboundEmail.findFirstOrThrow()).dispatchState).toBe(
      "CANCELLED"
    );
    const saved = await editRequestDraft(fixture.actor, {
      requestId: fixture.request.id,
      previousSnapshotId: fixture.snapshot.id,
      subject: "Updated privacy request",
      body: `${fixture.snapshot.body}\n\nPlease reply by email.`,
    });
    expect(saved.snapshotId).not.toBe(fixture.snapshot.id);
    const original = readSnapshotText(
      await testPrisma.requestSnapshot.findUniqueOrThrow({
        where: { id: fixture.snapshot.id },
      })
    );
    expect(original.body).toBe(fixture.snapshot.body);
    const edited = await getOwnedRequest(fixture.actor, fixture.request.id);
    expect(edited.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(edited.approvedEnvelopeHash).toBeNull();
    expect(edited.snapshots[0]!.subject).toBe("Updated privacy request");
    await expect(
      approveRequest(fixture.actor, {
        requestId: fixture.request.id,
        envelopeHash: fixture.snapshot.envelopeHash,
        confirmationAccepted: true,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("regenerates using the current broker contact while preserving the request reference", async () => {
    const fixture = await draft();
    await testPrisma.brokerContactMethod.updateMany({
      where: { brokerId: fixture.brokers[0]!.id },
      data: { value: "new-privacy@example.org" },
    });
    await regenerateRequestDraft(fixture.actor, fixture.request.id, fixture.snapshot.id);
    const current = await getOwnedRequest(fixture.actor, fixture.request.id);
    expect(current.externalReference).toBe(fixture.request.externalReference);
    expect(readApprovalEnvelope(current.snapshots[0]!).destination).toBe(
      "new-privacy@example.org"
    );
    expect(current.snapshots[0]!.body).toContain(fixture.request.externalReference!);
  });

  it("rejects stale edits, cross-account writes and invisible outbound content", async () => {
    const fixture = await draft();
    const input = {
      requestId: fixture.request.id,
      previousSnapshotId: fixture.snapshot.id,
      subject: "Edited request",
      body: fixture.snapshot.body,
    };
    await expect(editRequestDraft(testActor("foreign"), input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      editRequestDraft(fixture.actor, { ...input, body: "hidden\u202Econtent" })
    ).rejects.toMatchObject({ code: "UNSAFE_INPUT" });
    await editRequestDraft(fixture.actor, input);
    await expect(editRequestDraft(fixture.actor, input)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
