import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  scheduleOverdueRequest: vi.fn(),
  recordDeadlineWarning: vi.fn(),
  recordRecheckReminder: vi.fn(),
  listDeadlineWarningRequests: vi.fn(),
  listOverdueWaitingRequests: vi.fn(),
  getSetting: vi.fn(),
  recordAudit: vi.fn(),
  checkpointDeadlineWatchProgress: vi.fn(),
  hasCurrentLease: vi.fn(),
}));
vi.mock("@/lib/db/repositories/requestDeadlines", () => ({
  scheduleOverdueRequest: mocks.scheduleOverdueRequest,
  recordDeadlineWarning: mocks.recordDeadlineWarning,
  recordRecheckReminder: mocks.recordRecheckReminder,
}));
vi.mock("@/lib/db/repositories/requests", () => ({
  listDeadlineWarningRequests: mocks.listDeadlineWarningRequests,
  listOverdueWaitingRequests: mocks.listOverdueWaitingRequests,
}));
vi.mock("@/lib/config/runtimeSettings", () => ({ getSetting: mocks.getSetting }));
vi.mock("@/lib/audit/service", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/db/repositories/deadlineProgress", () => ({
  checkpointDeadlineWatchProgress: mocks.checkpointDeadlineWatchProgress,
}));
vi.mock("@/lib/db/repositories/jobs", () => ({ hasCurrentLease: mocks.hasCurrentLease }));
const { isRecheckReminderApplicable, runDeadlineWatch, runRecheckReminder } =
  await import("@/lib/jobs/deadlineWatch");
const job = { id: "job-1", leaseToken: "lease-1" };
beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getSetting.mockImplementation(async (name: string) =>
    name === "followUpDeadlineWarningDays"
      ? 7
      : name === "followUpFirstReminderDays"
        ? 3
        : 2
  );
  mocks.listDeadlineWarningRequests.mockResolvedValue([]);
  mocks.listOverdueWaitingRequests.mockResolvedValue([]);
  mocks.scheduleOverdueRequest.mockResolvedValue({ marked: true, queued: true });
  mocks.recordDeadlineWarning.mockResolvedValue(true);
  mocks.checkpointDeadlineWatchProgress.mockResolvedValue(true);
  mocks.hasCurrentLease.mockResolvedValue(true);
});
describe("deadline watch orchestration", () => {
  it("checkpoints a bounded scan so repeated failures cannot starve request 1001", async () => {
    const deadlineAt = new Date("2026-01-01");
    const requests = Array.from({ length: 1001 }, (_, index) => ({
      id: `request-${String(index).padStart(5, "0")}`,
      deadlineAt,
    }));
    mocks.listOverdueWaitingRequests.mockImplementation(async (_now, take, after) =>
      requests.filter((row) => !after || row.id > after.id).slice(0, take)
    );
    mocks.scheduleOverdueRequest.mockImplementation(async (_actor, input) => {
      if (input.requestId !== requests.at(-1)!.id)
        throw new Error("Repeated fixture failure");
      return { marked: true, queued: true };
    });
    const result = await runDeadlineWatch(7, job);
    expect(result.repeatAfterSeconds).toBe(1);
    const progress = mocks.checkpointDeadlineWatchProgress.mock.calls.at(-1)![1];
    expect(progress.overdueAfter.id).toBe(requests[999]!.id);
    const resumed = await runDeadlineWatch(7, job, progress);
    expect(resumed.metadata).toMatchObject({ marked: 1, followUpsQueued: 1 });
    expect(resumed.repeatAfterSeconds).toBeUndefined();
    expect(mocks.scheduleOverdueRequest).toHaveBeenCalledTimes(1001);
    expect(mocks.checkpointDeadlineWatchProgress.mock.calls.at(-1)![1]).toBeUndefined();
  });
  it("stops before listing a new batch when cancellation revokes the lease", async () => {
    mocks.hasCurrentLease.mockResolvedValue(false);
    await runDeadlineWatch(7, job);
    expect(mocks.listDeadlineWarningRequests).not.toHaveBeenCalled();
    expect(mocks.listOverdueWaitingRequests).not.toHaveBeenCalled();
    expect(mocks.checkpointDeadlineWatchProgress).not.toHaveBeenCalled();
  });
  it("excludes resolved and superseded states from reminders", () => {
    for (const state of ["COMPLETED", "CLOSED", "REJECTED", "FAILED"] as const)
      expect(isRecheckReminderApplicable(state)).toBe(false);
    expect(isRecheckReminderApplicable("WAITING_FOR_BROKER")).toBe(true);
    expect(isRecheckReminderApplicable("NO_RESPONSE")).toBe(true);
  });
  it("uses an atomic scheduling decision and reports only committed work", async () => {
    mocks.listOverdueWaitingRequests.mockResolvedValueOnce([
      { id: "req-1" },
      { id: "req-2" },
    ]);
    mocks.scheduleOverdueRequest.mockResolvedValueOnce({ marked: false, queued: false });
    const result = await runDeadlineWatch(14, job);
    expect(mocks.scheduleOverdueRequest).toHaveBeenCalledWith(
      expect.objectContaining({ isSystem: true }),
      expect.objectContaining({
        requestId: "req-1",
        maxFollowUps: 2,
        firstReminderDays: 3,
        job,
      })
    );
    expect(result.metadata).toEqual({ warned: 0, marked: 1, followUpsQueued: 1 });
  });
  it("does not spin on a failing batch or prevent other requests from progressing", async () => {
    mocks.listOverdueWaitingRequests.mockResolvedValue([
      { id: "req-1" },
      { id: "req-2" },
    ]);
    mocks.scheduleOverdueRequest.mockRejectedValueOnce(
      new Error("injected transaction failure")
    );
    expect((await runDeadlineWatch(14, job)).metadata).toMatchObject({
      marked: 1,
      followUpsQueued: 1,
    });
    expect(mocks.scheduleOverdueRequest).toHaveBeenCalledTimes(2);
  });
  it("passes the lease into warning publication and honors the smaller warning window", async () => {
    mocks.listDeadlineWarningRequests.mockResolvedValueOnce([{ id: "req-3" }]);
    expect((await runDeadlineWatch(3, job)).metadata).toMatchObject({ warned: 1 });
    const input = mocks.recordDeadlineWarning.mock.calls[0]![1];
    expect(input.job).toBe(job);
    expect(input.warningBefore.getTime() - input.now.getTime()).toBe(3 * 86400_000);
  });
  it("advances past a full failing page instead of starving later response targets", async () => {
    const deadlineAt = new Date("2026-01-01");
    const first = Array.from({ length: 50 }, (_, i) => ({
      id: `request-${i}`,
      deadlineAt,
    }));
    mocks.listOverdueWaitingRequests
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([{ id: "later-request", deadlineAt }]);
    mocks.scheduleOverdueRequest.mockImplementation(async (_actor, input) => {
      if (input.requestId !== "later-request")
        throw new Error("Injected repeated failure");
      return { marked: true, queued: true };
    });
    expect((await runDeadlineWatch(7, job)).metadata).toMatchObject({
      marked: 1,
      followUpsQueued: 1,
    });
    expect(mocks.listOverdueWaitingRequests.mock.calls[1]![2]).toEqual({
      deadlineAt,
      id: "request-49",
    });
    expect(mocks.scheduleOverdueRequest).toHaveBeenCalledTimes(51);
  });
  it("does not audit a skipped stale reminder as successfully delivered", async () => {
    mocks.recordRecheckReminder.mockResolvedValue(false);
    expect((await runRecheckReminder("req-4", job)).message).toMatch(
      /no longer applicable/
    );
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
