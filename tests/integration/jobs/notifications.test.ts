import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNotification,
  getNotificationPreferences,
  listOwnedNotifications,
  updateNotificationPreferences,
  updateOwnedNotification,
} from "@/lib/db/repositories/notifications";
import { claimDueJobs, expireStaleLocks } from "@/lib/db/repositories/jobs";
import { markAccountDeletionRequested } from "@/lib/db/repositories/account";
import { getEmailProvider } from "@/lib/email";
import { clearMockOutbox, getMockOutbox } from "@/lib/email/providers/mock";
import { dispatchNotificationEmail } from "@/lib/notifications/service";
import { notificationPreferences } from "@/lib/notifications/preferences";
import { systemActor } from "@/lib/permissions/actor";
import type { ClaimedJob } from "@/lib/jobs/types";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

afterEach(() => {
  vi.restoreAllMocks();
  clearMockOutbox();
});

async function fixture(optIn = false) {
  const user = await testPrisma.user.create({
    data: { email: `${randomUUID()}@example.org`, emailVerified: new Date() },
  });
  const actor = testActor(user.id);
  if (optIn) await updateNotificationPreferences(actor, { emailEnabled: true });
  const input = {
    userId: user.id,
    type: "BROKER_RESPONSE_RECEIVED" as const,
    title: "Private broker name",
    body: "Private reply text and profile details.",
    actionUrl: "/responses",
    dedupeKey: randomUUID(),
  };
  return { user, actor, input };
}
async function claim() {
  const [job] = await claimDueJobs("notification-test", 1);
  expect(job?.type).toBe("DISPATCH_NOTIFICATION");
  return job as ClaimedJob<"DISPATCH_NOTIFICATION">;
}

describe("owned notification inbox and explicit email preference", () => {
  it("defaults to in-app updates and refuses ambiguous legacy preference shapes", async () => {
    const f = await fixture();
    expect(await getNotificationPreferences(f.actor)).toEqual({ emailEnabled: false });
    expect(notificationPreferences({ notifications: { emailEnabled: true } })).toBeNull();
    const result = await Promise.all([
      createNotification(f.actor, f.input),
      createNotification(f.actor, f.input),
    ]);
    expect(new Set(result.map((row) => row!.id)).size).toBe(1);
    expect(result[0]).toMatchObject({ channel: "IN_APP", emailConsentId: null });
    expect(await testPrisma.backgroundJob.count()).toBe(0);
    expect((await listOwnedNotifications(f.actor)).items).toHaveLength(1);
  });

  it("commits a notification and its opted-in email job atomically", async () => {
    const f = await fixture(true);
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_notification_job_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected notification job failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_notification_job_failure BEFORE INSERT ON "BackgroundJob" FOR EACH ROW EXECUTE FUNCTION test_notification_job_failure()`
    );
    try {
      await expect(createNotification(f.actor, f.input)).rejects.toThrow();
      expect(await testPrisma.notification.count()).toBe(0);
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_notification_job_failure ON "BackgroundJob"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_notification_job_failure()`);
    }
    await Promise.all([
      createNotification(f.actor, f.input),
      createNotification(f.actor, f.input),
    ]);
    expect(await testPrisma.notification.count()).toBe(1);
    expect(await testPrisma.backgroundJob.count()).toBe(1);
  });

  it("sends a generic reminder once and leaves personal notification content in the app", async () => {
    const f = await fixture(true);
    const notification = await createNotification(f.actor, f.input);
    const job = await claim();
    await Promise.all([dispatchNotificationEmail(job), dispatchNotificationEmail(job)]);
    expect(getMockOutbox()).toHaveLength(1);
    expect(JSON.stringify(getMockOutbox())).not.toMatch(
      /Private broker name|Private reply text/
    );
    expect(
      await testPrisma.notification.findUniqueOrThrow({ where: { id: notification!.id } })
    ).toMatchObject({ emailDispatchState: "ACCEPTED", emailProvider: "MOCK" });
    await dispatchNotificationEmail(job);
    expect(getMockOutbox()).toHaveLength(1);
  });

  it("cancels claimed work on opt-out and does not revive old notices after opt-in", async () => {
    const f = await fixture(true);
    const old = await createNotification(f.actor, f.input);
    const job = await claim();
    await updateNotificationPreferences(f.actor, { emailEnabled: false });
    await updateNotificationPreferences(f.actor, { emailEnabled: true });
    await dispatchNotificationEmail(job);
    expect(getMockOutbox()).toHaveLength(0);
    await createNotification(f.actor, f.input);
    expect(
      (await testPrisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } })).status
    ).toBe("CANCELLED");
    const next = await createNotification(f.actor, {
      ...f.input,
      dedupeKey: randomUUID(),
    });
    expect(next!.emailConsentId).not.toBe(old!.emailConsentId);
    await dispatchNotificationEmail(await claim());
    expect(getMockOutbox()).toHaveLength(1);
  });

  it("keeps cancellation authoritative after a provider operation has started", async () => {
    const f = await fixture(true);
    const notification = await createNotification(f.actor, f.input);
    const job = await claim();
    vi.spyOn(getEmailProvider(), "sendNotificationEmail").mockImplementationOnce(
      async () => {
        await updateNotificationPreferences(f.actor, { emailEnabled: false });
        return {
          provider: "MOCK",
          providerMessageId: "simulated-in-flight",
          dispatched: false,
          sentAt: new Date(),
        };
      }
    );
    await dispatchNotificationEmail(job);
    expect(
      await testPrisma.notification.findUniqueOrThrow({ where: { id: notification!.id } })
    ).toMatchObject({ emailDispatchState: "AMBIGUOUS", emailedAt: null });
    expect(
      (await testPrisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } })).status
    ).toBe("CANCELLED");
  });

  it("does not dispatch from stale leases or replay an uncertain old provider attempt", async () => {
    const f = await fixture(true);
    const notification = await createNotification(f.actor, f.input);
    const old = await claim();
    await testPrisma.backgroundJob.update({
      where: { id: old.id },
      data: { lockExpiresAt: new Date(0) },
    });
    await expireStaleLocks();
    const current = await claim();
    await dispatchNotificationEmail(old);
    expect(getMockOutbox()).toHaveLength(0);
    const provider = vi
      .spyOn(getEmailProvider(), "sendNotificationEmail")
      .mockRejectedValueOnce(new Error("Ambiguous test transport failure"));
    await expect(dispatchNotificationEmail(current)).rejects.toThrow();
    await testPrisma.notification.update({
      where: { id: notification!.id },
      data: { emailDispatchStartedAt: new Date(Date.now() - 25 * 60 * 60_000) },
    });
    await dispatchNotificationEmail(current);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(
      (
        await testPrisma.notification.findUniqueOrThrow({
          where: { id: notification!.id },
        })
      ).emailDispatchState
    ).toBe("RECONCILIATION_REQUIRED");
  });

  it("prevents reading or dismissing another account's notifications and checks profile ownership", async () => {
    const f = await fixture();
    const notification = await createNotification(f.actor, f.input);
    const foreign = testActor("foreign", "INSTANCE_ADMIN", {
      adminGrant: {
        adminActionId: "grant",
        scope: `user:${f.user.id}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    expect((await listOwnedNotifications(foreign)).items).toHaveLength(0);
    await expect(
      updateOwnedNotification(foreign, { id: notification!.id, operation: "dismiss" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateNotificationPreferences(systemActor("unapproved"), { emailEnabled: true })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await workflowFixture();
    await expect(
      createNotification(f.actor, {
        ...f.input,
        profileId: other.profile.id,
        dedupeKey: randomUUID(),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("paginates stable ties without omissions and supports read, dismiss and restore", async () => {
    const f = await fixture();
    await testPrisma.notification.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        userId: f.user.id,
        type: "REQUEST_PREPARED" as const,
        title: `Notice ${index}`,
        body: "Review it",
        createdAt: new Date("2026-01-01"),
        actionUrl: index === 0 ? "https://example.invalid/untrusted" : "/requests",
      })),
    });
    const first = await listOwnedNotifications(f.actor);
    const second = await listOwnedNotifications(f.actor, { cursor: first.nextCursor });
    const third = await listOwnedNotifications(f.actor, { cursor: second.nextCursor });
    const all = [...first.items, ...second.items, ...third.items];
    expect(all).toHaveLength(55);
    expect(new Set(all.map((row) => row.id)).size).toBe(55);
    expect(third.nextCursor).toBeNull();
    expect(all.find((row) => row.title === "Notice 0")!.actionUrl).toBeNull();
    const id = first.items[0]!.id;
    await updateOwnedNotification(f.actor, { id, operation: "read" });
    expect(
      (await listOwnedNotifications(f.actor)).items.map((row) => row.id)
    ).not.toContain(id);
    await updateOwnedNotification(f.actor, { id, operation: "dismiss" });
    expect(
      (await listOwnedNotifications(f.actor, { filter: "dismissed" })).items[0]!.id
    ).toBe(id);
    await updateOwnedNotification(f.actor, { id, operation: "restore" });
    expect(
      (await listOwnedNotifications(f.actor, { filter: "dismissed" })).items
    ).toHaveLength(0);
    await expect(
      listOwnedNotifications(f.actor, { cursor: "invalid" })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("blocks new email after a notification is read or the account requests deletion", async () => {
    const f = await fixture(true);
    const notification = await createNotification(f.actor, f.input);
    const job = await claim();
    await updateOwnedNotification(f.actor, { id: notification!.id, operation: "read" });
    await dispatchNotificationEmail(job);
    expect(getMockOutbox()).toHaveLength(0);
    await createNotification(f.actor, { ...f.input, dedupeKey: randomUUID() });
    const next = await claim();
    await markAccountDeletionRequested(f.actor);
    await dispatchNotificationEmail(next);
    expect(getMockOutbox()).toHaveLength(0);
    expect((await listOwnedNotifications(f.actor)).items).toHaveLength(0);
  });
});
