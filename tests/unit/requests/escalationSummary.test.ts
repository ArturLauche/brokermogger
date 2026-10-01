import { beforeEach, describe, expect, it, vi } from "vitest";
import { testActor } from "../../helpers/actor";

const mocks = vi.hoisted(() => ({
  tx: {
    $executeRaw: vi.fn(),
    removalRequest: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    legalRuleVersion: { findUnique: vi.fn() },
    removalRequestEvent: { findFirst: vi.fn() },
    brokerResponse: { groupBy: vi.fn() },
    manualSubmission: { aggregate: vi.fn() },
    requestSnapshot: { count: vi.fn() },
    evidenceFile: { count: vi.fn() },
    outboundEmail: { count: vi.fn() },
  },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $transaction: (handler: (tx: typeof mocks.tx) => Promise<unknown>) =>
      handler(mocks.tx),
  },
}));

const { getEscalationSummary } = await import("@/lib/db/repositories/requestEscalation");
const actor = testActor("escalation-owner");
const requestId = "escalation-request";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tx.removalRequest.findFirst
    .mockResolvedValueOnce({
      userId: actor.userId,
      profileId: "escalation-profile",
      brokerId: "escalation-broker",
    })
    .mockResolvedValueOnce({
      id: requestId,
      userId: actor.userId,
      status: "ESCALATION_RECOMMENDED",
      externalReference: "BM-0123456789ABCDEF0123456789ABCDEF",
      requestType: "DELETION",
      legalBasisText: "Synthetic sourced rule",
      deadlineAt: new Date("2026-09-30T00:00:00Z"),
      deadlineOn: new Date("2026-09-30T00:00:00Z"),
      deadlineIsEstimate: true,
      deadlineNote: "Estimated from dispatch",
      deadlineBasis: "ESTIMATED_DISPATCH",
      deadlineAnchorOn: null,
      sentAt: new Date("2026-08-30T00:00:00Z"),
      legalRuleVersionId: null,
      broker: { legalName: "Synthetic broker" },
    });
  mocks.tx.user.findFirst.mockResolvedValue({ id: actor.userId });
  mocks.tx.removalRequestEvent.findFirst.mockResolvedValue({ fromStatus: "NO_RESPONSE" });
  mocks.tx.brokerResponse.groupBy.mockResolvedValue([]);
  mocks.tx.manualSubmission.aggregate.mockResolvedValue({
    _count: { _all: 0 },
    _min: { submittedOn: null, receivedOn: null },
    _max: { submittedOn: null },
  });
  mocks.tx.requestSnapshot.count.mockResolvedValue(1);
  mocks.tx.evidenceFile.count.mockResolvedValue(0);
  mocks.tx.outboundEmail.count.mockResolvedValue(0);
});

describe("minimized escalation preparation", () => {
  it("selects only summary metadata under ownership and deletion guards", async () => {
    expect(await getEscalationSummary(actor, requestId)).toMatchObject({
      requestId,
      previousStatus: "NO_RESPONSE",
      snapshotCount: 1,
    });
    const query = mocks.tx.removalRequest.findFirst.mock.calls[1]![0];
    expect(query.include).toBeUndefined();
    expect(query.select).toEqual({
      id: true,
      userId: true,
      status: true,
      externalReference: true,
      requestType: true,
      legalBasisText: true,
      deadlineAt: true,
      deadlineOn: true,
      deadlineIsEstimate: true,
      deadlineNote: true,
      deadlineBasis: true,
      deadlineAnchorOn: true,
      sentAt: true,
      legalRuleVersionId: true,
      broker: { select: { legalName: true } },
    });
    expect(query.where).toMatchObject({
      id: requestId,
      userId: actor.userId,
      deletedAt: null,
      profile: { deletedAt: null, ownerUserId: actor.userId },
    });
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(4);
  });

  it("rejects a foreign owner before loading summary or identity relations", async () => {
    await expect(
      getEscalationSummary(testActor("foreign"), requestId)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.tx.removalRequest.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.tx.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.tx.brokerResponse.groupBy).not.toHaveBeenCalled();
  });

  it("blocks a pending deletion before loading summary relations", async () => {
    mocks.tx.user.findFirst.mockResolvedValue(null);
    await expect(getEscalationSummary(actor, requestId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.tx.removalRequest.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.tx.brokerResponse.groupBy).not.toHaveBeenCalled();
  });
});
