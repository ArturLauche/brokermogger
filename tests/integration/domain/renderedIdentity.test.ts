import { afterEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/config/env";
import { prepareRequestDrafts, generateRequests } from "@/lib/requests/generation";
import { createPreparedDrafts } from "@/lib/db/repositories/requestGeneration";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { prepareOwnedSendingIdentity } from "@/lib/db/repositories/inboundMailboxes";
import { readApprovalEnvelope } from "@/lib/requests/envelope";
import { renderFollowUpSnapshot } from "@/lib/requests/followUp";
import { editRequestDraft, regenerateRequestDraft } from "@/lib/requests/editing";
import { readSnapshotText } from "@/lib/requests/snapshot";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";
import { testActor } from "../../helpers/actor";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCacheForTests();
});

describe("rendered reply identity", () => {
  it("does not allow another account to prepare or reveal a private reply identity", async () => {
    const f = await workflowFixture();
    const other = await testPrisma.user.create({
      data: { email: "other-identity@example.org" },
    });
    await expect(
      prepareOwnedSendingIdentity(testActor(other.id), f.user.id)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testPrisma.inboundMailbox.count()).toBe(0);
  });

  it("allocates one encrypted reply alias under concurrent preparation", async () => {
    vi.stubEnv("RESEND_RECEIVING_DOMAIN", "replies.example.org");
    vi.stubEnv("RESEND_API_KEY", "test-receiving-key");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "test-webhook-key");
    resetEnvCacheForTests();
    const f = await workflowFixture();
    const identities = await Promise.all([
      prepareOwnedSendingIdentity(f.actor, f.user.id),
      prepareOwnedSendingIdentity(f.actor, f.user.id),
    ]);
    expect(identities[0]).toEqual(identities[1]);
    const mailbox = await testPrisma.inboundMailbox.findMany();
    expect(mailbox).toHaveLength(1);
    expect(JSON.stringify(mailbox)).not.toContain(identities[0]!.replyTo);
  });

  it.each([false, true])(
    "uses the approved reply address in initial and follow-up text (receiving: %s)",
    async (receiving) => {
      if (receiving) {
        vi.stubEnv("RESEND_RECEIVING_DOMAIN", "replies.example.org");
        vi.stubEnv("RESEND_API_KEY", "test-receiving-key");
        vi.stubEnv("RESEND_WEBHOOK_SECRET", "test-webhook-key");
        resetEnvCacheForTests();
      }
      const f = await workflowFixture();
      const {
        requestIds: [id],
      } = await generateRequests(f.actor, f.input);
      const request = await getOwnedRequest(f.actor, id!);
      const envelope = readApprovalEnvelope(request.snapshots[0]!);
      expect(request.snapshots[0]!.body).toContain(envelope.replyTo);
      const followUp = await renderFollowUpSnapshot(f.actor, request, 1);
      expect(followUp.body).toContain(envelope.replyTo);
      if (receiving) {
        expect(envelope.replyTo).toMatch(/^bm-[a-f0-9]{48}@replies\.example\.org$/);
        expect(await testPrisma.inboundMailbox.count()).toBe(1);
        expect(JSON.stringify(request.snapshots[0]!.variables)).not.toContain(
          envelope.replyTo
        );
      }
    }
  );

  it("rejects a reply configuration change after rendering without writing a request or spending quota", async () => {
    const f = await workflowFixture();
    const { drafts, fairUse } = await prepareRequestDrafts(f.actor, f.input);
    vi.stubEnv("EMAIL_REPLY_TO", "changed-replies@example.org");
    resetEnvCacheForTests();
    await expect(createPreparedDrafts(f.actor, drafts, fairUse)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await testPrisma.removalRequest.count()).toBe(0);
    expect(await testPrisma.rateLimitBucket.count()).toBe(0);
  });

  it("requires regeneration when reply configuration changes, while preserving historical text", async () => {
    const f = await workflowFixture();
    const {
      requestIds: [id],
    } = await generateRequests(f.actor, f.input);
    const request = await getOwnedRequest(f.actor, id!);
    const previous = request.snapshots[0]!;
    vi.stubEnv("EMAIL_REPLY_TO", "new-replies@example.org");
    resetEnvCacheForTests();
    await expect(
      editRequestDraft(f.actor, {
        requestId: id,
        previousSnapshotId: previous.id,
        subject: previous.subject,
        body: previous.body + "\nPlease confirm the outcome.",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await regenerateRequestDraft(f.actor, id!, previous.id);
    const regenerated = await getOwnedRequest(f.actor, id!);
    const envelope = readApprovalEnvelope(regenerated.snapshots[0]!);
    expect(envelope.replyTo).toBe("new-replies@example.org");
    expect(regenerated.snapshots[0]!.body).toContain(envelope.replyTo);
    expect(
      readSnapshotText(
        await testPrisma.requestSnapshot.findUniqueOrThrow({ where: { id: previous.id } })
      ).body
    ).toBe(previous.body);
  });
});
