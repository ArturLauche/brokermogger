import { PrismaClient } from "./db";
import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import {
  fillProfile,
  resetBrowserAuthenticationLimit,
  signIn,
  makeBrowserJobDue,
} from "./helpers";
import { accountEmailIndex } from "@/lib/security/accountEmail";

test.beforeAll(resetBrowserAuthenticationLimit);

test("deletes an account through confirmation, blocks the old session and completes the queued purge", async ({
  page,
  baseURL,
}) => {
  const email = `erasure-${randomUUID()}@example.org`;
  await signIn(page, email);
  await page.goto("/onboarding");
  await fillProfile(page, email, "Alex Erasure Browser");
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/evidence");
  await page.getByLabel("File", { exact: true }).setInputFiles({
    name: "private-evidence.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nSynthetic erasure browser evidence\n%%EOF"),
  });
  await page.getByRole("button", { name: "Store file", exact: true }).click();
  await expect(page).toHaveURL(/stored=1/);
  const downloadPath = (await page
    .getByRole("link", { name: "Download", exact: true })
    .getAttribute("href"))!;
  expect((await page.request.get(downloadPath)).status()).toBe(200);

  const db = new PrismaClient();
  try {
    const account = await db.user.findUniqueOrThrow({
      where: { emailBi: accountEmailIndex(email) },
      select: { id: true },
    });
    const oldCookies = await page.context().cookies();
    const stored = await db.evidenceFile.findFirstOrThrow({
      where: { userId: account.id },
      select: { storageBackend: true, storageKey: true },
    });
    const { getStorage } = await import("../lib/storage");
    const storage = getStorage(stored.storageBackend);
    // Prove the worker can see the app's object before claiming its deletion.
    // Separate in-memory adapters would make the final absence check vacuous.
    expect(await storage.exists(stored.storageKey)).toBe(true);
    await page.goto("/settings/account");
    await page.getByRole("button", { name: "Delete my account", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete my account" });
    const confirm = dialog.getByRole("button", {
      name: "Delete my account",
      exact: true,
    });
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true })
    ).toBeFocused();
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/Type DELETE to confirm/).fill("DELETE");
    await confirm.click();
    await expect(page).toHaveURL(`${baseURL}/`);
    const pending = await db.user.findUniqueOrThrow({
      where: { id: account.id },
      select: { status: true, deletionRequestedAt: true },
    });
    expect(pending.status).toBe("PENDING_DELETION");
    expect(pending.deletionRequestedAt).not.toBeNull();
    expect(await db.session.count({ where: { userId: account.id } })).toBe(0);
    // Replay the actual revoked cookie, rather than only relying on cleared UI state.
    await page.context().addCookies(oldCookies);
    await page.goto("/vault");
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get(downloadPath)).status()).toBe(401);

    const row = await db.backgroundJob.findUniqueOrThrow({
      where: { idempotencyKey: `delete-account:${account.id}` },
    });
    expect(row.status).toBe("PENDING");
    await makeBrowserJobDue(db, row.id);
    const { claimDueJobs } = await import("../lib/db/repositories/jobs");
    const { runClaimedJob } = await import("../lib/jobs/queue");
    const { createJobHandlers } = await import("../lib/jobs/handlers");
    const [job] = await claimDueJobs("browser-account-erasure", 1);
    expect(job?.id).toBe(row.id);
    await runClaimedJob(job!, createJobHandlers());
    expect(
      (await db.backgroundJob.findUniqueOrThrow({ where: { id: row.id } })).status
    ).toBe("COMPLETED");
    const erased = await db.user.findUniqueOrThrow({
      where: { id: account.id },
      select: { status: true, emailEnc: true, emailBi: true },
    });
    expect(erased).toEqual({ status: "DELETED", emailEnc: null, emailBi: null });
    expect(
      await db.profileIdentifier.count({
        where: { profile: { ownerUserId: account.id } },
      })
    ).toBe(0);
    expect(await db.evidenceFile.count({ where: { userId: account.id } })).toBe(0);
    expect(await storage.exists(stored.storageKey)).toBe(false);
  } finally {
    await db.$disconnect();
  }
});
