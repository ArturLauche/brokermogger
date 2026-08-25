import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  markNoResponse: vi.fn(),
  createNotification: vi.fn(),
  listDeadlineWarningRequests: vi.fn(),
  listOverdueWaitingRequests: vi.fn(),
  getOwnedRequest: vi.fn(),
  getSetting: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: mocks.enqueueJob,
}));

vi.mock("@/lib/requests/lifecycle", () => ({
  markNoResponse: mocks.markNoResponse,
}));

vi.mock("@/lib/db/repositories/notifications", () => ({
  createNotification: mocks.createNotification,
}));

vi.mock("@/lib/db/repositories/requests", () => ({
  getOwnedRequest: mocks.getOwnedRequest,
  listDeadlineWarningRequests: mocks.listDeadlineWarningRequests,
  listOverdueWaitingRequests: mocks.listOverdueWaitingRequests,
}));

vi.mock("@/lib/config/runtimeSettings", () => ({
  getSetting: mocks.getSetting,
}));

vi.mock("@/lib/audit/service", () => ({
  recordAudit: mocks.recordAudit,
}));

const { isRecheckReminderApplicable, runDeadlineWatch, runRecheckReminder } =
  await import("@/lib/jobs/deadlineWatch");

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.getSetting.mockImplementation(async (name: string) => {
    if (name === "followUpDeadlineWarningDays") return 7;
    if (name === "followUpFirstReminderDays") return 3;
    return 1;
  });
  mocks.enqueueJob.mockResolvedValue({ id: "job-1", created: true });
  mocks.markNoResponse.mockResolvedValue(undefined);
  mocks.listDeadlineWarningRequests.mockResolvedValue([]);
  mocks.listOverdueWaitingRequests.mockResolvedValue([]);
  mocks.createNotification.mockResolvedValue({
    id: "n1",
    emailedAt: null,
    channel: "EMAIL",
  });
  mocks.recordAudit.mockResolvedValue(undefined);
});

describe("isRecheckReminderApplicable", () => {
  it("is a no-op for terminal and superseded statuses", () => {
    expect(isRecheckReminderApplicable("COMPLETED")).toBe(false);
    expect(isRecheckReminderApplicable("CLOSED")).toBe(false);
    expect(isRecheckReminderApplicable("REJECTED")).toBe(false);
    expect(isRecheckReminderApplicable("FAILED")).toBe(false);
    expect(isRecheckReminderApplicable("WAITING_FOR_BROKER")).toBe(true);
    expect(isRecheckReminderApplicable("NO_RESPONSE")).toBe(true);
  });
});

describe("runDeadlineWatch", () => {
  it("enqueues follow-up and recheck jobs before marking NO_RESPONSE", async () => {
    const order: string[] = [];
    mocks.listOverdueWaitingRequests.mockResolvedValueOnce([
      {
        id: "req-1",
        userId: "user-1",
        profileId: "profile-1",
        status: "WAITING_FOR_BROKER",
        deadlineAt: new Date("2026-08-01T00:00:00.000Z"),
        followUpCount: 0,
      },
    ]);
    mocks.enqueueJob.mockImplementation(async () => {
      order.push("enqueue");
      return { id: "job-1", created: true };
    });
    mocks.markNoResponse.mockImplementation(async () => {
      order.push("mark");
    });

    await runDeadlineWatch(14);

    expect(order).toEqual(["enqueue", "enqueue", "mark"]);
    expect(mocks.enqueueJob).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "PREPARE_FOLLOW_UP",
        idempotencyKey: "follow-up:req-1:1",
      })
    );
    expect(mocks.enqueueJob).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "RECHECK_REMINDER",
        idempotencyKey: "recheck:req-1",
      })
    );
  });

  it("does not mark NO_RESPONSE when enqueue fails, so the next pass can retry", async () => {
    mocks.listOverdueWaitingRequests.mockResolvedValueOnce([
      {
        id: "req-2",
        userId: "user-1",
        profileId: "profile-1",
        status: "WAITING_FOR_BROKER",
        deadlineAt: new Date("2026-08-01T00:00:00.000Z"),
        followUpCount: 0,
      },
    ]);
    mocks.enqueueJob.mockRejectedValueOnce(new Error("queue unavailable"));

    await runDeadlineWatch(14);

    expect(mocks.markNoResponse).not.toHaveBeenCalled();
  });

  it("re-enqueues a deadline warning when the notification exists but was never emailed", async () => {
    mocks.listDeadlineWarningRequests.mockResolvedValueOnce([
      {
        id: "req-3",
        userId: "user-1",
        profileId: "profile-1",
        deadlineAt: new Date("2026-08-28T00:00:00.000Z"),
      },
    ]);
    mocks.createNotification.mockResolvedValueOnce({
      id: "n-existing",
      emailedAt: null,
      channel: "EMAIL",
    });

    await runDeadlineWatch(14);

    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "DISPATCH_NOTIFICATION",
        payload: { notificationId: "n-existing" },
        idempotencyKey: "notify:n-existing",
      })
    );
  });
});

describe("runRecheckReminder", () => {
  it("does not email a stale reminder after the request completed", async () => {
    mocks.getOwnedRequest.mockResolvedValueOnce({
      id: "req-4",
      status: "COMPLETED",
      userId: "user-1",
      profileId: "profile-1",
    });

    const result = await runRecheckReminder("req-4");

    expect(result.message).toMatch(/COMPLETED/);
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });
});
