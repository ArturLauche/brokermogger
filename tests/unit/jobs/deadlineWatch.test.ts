import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  scheduleOverdueRequest: vi.fn(),
  recordDeadlineWarning: vi.fn(),
  recordRecheckReminder: vi.fn(),
  listDeadlineWarningRequests: vi.fn(),
  listOverdueWaitingRequests: vi.fn(),
  getSetting: vi.fn(),
  recordAudit: vi.fn(),
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
});
describe("deadline watch orchestration", () => {
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
  it("does not audit a skipped stale reminder as successfully delivered", async () => {
    mocks.recordRecheckReminder.mockResolvedValue(false);
    expect((await runRecheckReminder("req-4", job)).message).toMatch(
      /no longer applicable/
    );
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
