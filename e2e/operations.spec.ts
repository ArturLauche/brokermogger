import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { PrismaClient } from "./db";
import { accountEmailIndex } from "../lib/security/accountEmail";
import { expect, test } from "./fixtures";
import { resetBrowserAuthenticationLimit, signIn } from "./helpers";

test.beforeAll(resetBrowserAuthenticationLimit);

test("queues an audit check and shows actual worker health and the complete result", async ({
  page,
}) => {
  const email = `operations-${randomUUID()}@example.org`;
  await signIn(page, email);
  const db = new PrismaClient();
  let worker: ReturnType<typeof spawn> | undefined;
  try {
    await db.user.update({
      where: { emailBi: accountEmailIndex(email) },
      data: { role: "INSTANCE_ADMIN" },
    });
    await page.goto("/admin/audit");
    await page.getByRole("button", { name: "Check now", exact: true }).click();
    await expect(page).toHaveURL(/check=requested/);
    await expect(
      page.getByRole("status").filter({ hasText: "Verification requested" })
    ).toBeVisible();
    const startedAt = new Date();
    worker = spawn(process.execPath, ["--import", "tsx", "workers/worker.ts"], {
      env: process.env,
      stdio: "ignore",
    });
    await expect
      .poll(
        async () =>
          db.auditChainVerification.count({ where: { completedAt: { gte: startedAt } } }),
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0);
    await page.getByRole("link", { name: "Refresh status", exact: true }).click();
    await expect(
      page.getByText(/Checked \d+ retained rows\. No inconsistency found\./)
    ).toBeVisible();
    await expect(page.getByText(/Snapshot ends at sequence/)).toBeVisible();
    await page.goto("/admin/jobs");
    await expect(page.getByRole("heading", { name: "Queue health" })).toBeVisible();
    await expect(page.getByText("1 recent", { exact: true })).toBeVisible();
    await expect(page.getByText("Uncertain delivery", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    ).toBe(true);
  } finally {
    if (worker && worker.exitCode === null) {
      const stopped = new Promise<void>((resolve) =>
        worker!.once("exit", () => resolve())
      );
      worker.kill("SIGTERM");
      const killTimer = setTimeout(() => worker!.kill("SIGKILL"), 10_000);
      await stopped;
      clearTimeout(killTimer);
    }
    await db.$disconnect();
  }
});
