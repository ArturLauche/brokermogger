import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import AxeBuilder from "@axe-core/playwright";
import { accountEmailIndex } from "../lib/security/accountEmail";
import { appendRequestEvent } from "../lib/db/repositories/requests";
import { seedJurisdictions } from "../prisma/seeds/jurisdictions";
import { expect, test } from "./fixtures";
import { fillProfile, resetBrowserAuthenticationLimit, signIn } from "./helpers";

test.beforeAll(resetBrowserAuthenticationLimit);

test("pages private history, retains attachment choices and recovers from invalid URL filters", async ({
  page,
}) => {
  expect(new URL(process.env.DATABASE_URL!).pathname).toMatch(/_test$/);
  expect(process.env.EMAIL_PROVIDER).toBe("mock");
  expect(process.env.ALLOW_EXTERNAL_SENDING).toBe("false");
  const email = `history-${randomUUID()}@example.org`;
  await signIn(page, email);
  await page.goto("/onboarding");
  await fillProfile(page, email, "Alex History");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const db = new PrismaClient();
  let id: string;
  let foreignId: string;
  try {
    await seedJurisdictions(db);
    const user = await db.user.findUniqueOrThrow({
      where: { emailBi: accountEmailIndex(email) },
    });
    const profile = await db.userProfile.findFirstOrThrow({
      where: { ownerUserId: user.id, kind: "SELF" },
    });
    const jurisdiction = await db.jurisdiction.findUniqueOrThrow({
      where: { code: "US-CA" },
    });
    const broker = await db.broker.create({
      data: {
        slug: `history-${randomUUID()}`,
        legalName: "Synthetic history broker",
        category: "PEOPLE_SEARCH",
        isDemoData: true,
        productionSendingEnabled: false,
      },
    });
    const request = await db.removalRequest.create({
      data: {
        userId: user.id,
        profileId: profile.id,
        brokerId: broker.id,
        jurisdictionId: jurisdiction.id,
        requestType: "DELETION",
        channel: "WEB_FORM",
        status: "COMPLETED",
        sentAt: new Date("2026-09-01"),
        approvedAt: new Date("2026-09-01"),
        approvedByUserId: user.id,
        legalBasisText: "Synthetic browser fixture",
      },
    });
    id = request.id;
    for (let index = 0; index < 76; index++)
      await appendRequestEvent({
        removalRequestId: id,
        type: "NOTE",
        fromStatus: "COMPLETED",
        toStatus: "COMPLETED",
        actorType: "USER",
        actorUserId: user.id,
        message: `Synthetic event ${String(index).padStart(2, "0")}`,
      });
    const snapshots = Array.from({ length: 76 }, (_, index) => ({
      id: randomUUID(),
      removalRequestId: id,
      version: index + 1,
      subject: "",
      body: "",
      contentHash: "synthetic",
      identifierDigest: "synthetic",
    }));
    await db.requestSnapshot.createMany({ data: snapshots });
    await db.manualSubmission.createMany({
      data: snapshots.map((snapshot) => ({
        removalRequestId: id,
        snapshotId: snapshot.id,
        submittedOn: new Date("2026-09-01"),
        recordedByUserId: user.id,
      })),
    });
    await db.evidenceFile.createMany({
      data: Array.from({ length: 31 }, (_, index) => ({
        userId: user.id,
        profileId: profile.id,
        removalRequestId: id,
        kind: "OTHER",
        storageKey: randomUUID(),
        storageBackend: "local",
        contentType: "application/pdf",
        byteSize: 100,
        checksumSha256: "c".repeat(64),
        filenameMasked: `Receipt ${String(index).padStart(2, "0")}.pdf`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      })),
    });
    const foreign = await db.user.create({
      data: { email: `foreign-${randomUUID()}@example.org` },
    });
    const foreignProfile = await db.userProfile.create({
      data: {
        ownerUserId: foreign.id,
        kind: "SELF",
        consentStatus: "SELF",
        displayName: "Foreign fixture",
        countryCode: "US",
      },
    });
    foreignId = (
      await db.removalRequest.create({
        data: {
          userId: foreign.id,
          profileId: foreignProfile.id,
          brokerId: broker.id,
          jurisdictionId: jurisdiction.id,
          requestType: "DELETION",
          channel: "WEB_FORM",
          status: "COMPLETED",
          legalBasisText: "Foreign fixture",
        },
      })
    ).id;
  } finally {
    await db.$disconnect();
  }
  await page.goto(`/requests/${id}`);
  await expect(page.getByText("Synthetic event 75", { exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic event 00", { exact: true })).toHaveCount(0);
  for (let index = 0; index < 3; index++) {
    const previousUrl = page.url();
    await page
      .getByRole("navigation", { name: "Request history pages" })
      .getByRole("link", { name: /Next page/ })
      .click();
    await expect(page).not.toHaveURL(previousUrl);
    await expect(
      page.getByText(`Synthetic event ${String(50 - index * 25).padStart(2, "0")}`, {
        exact: true,
      })
    ).toBeVisible();
  }
  await expect(page.getByText("Synthetic event 00", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Manual submissions pages" })
    .getByRole("link", { name: /Next page/ })
    .click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "Showing 25 of 76 matching submissions"
  );
  await page.goto(`/requests/${id}/responses/new`);
  await page
    .getByLabel("Reply text", { exact: true })
    .fill("Unfinished correspondence is preserved.");
  await page.getByLabel("Reply evidence (optional)").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Showing 25 of 31 matching files");
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    ).toBe(false);
    await page.screenshot({
      path: `.tmp/interface-history/attachment-dialog-${width}.png`,
      fullPage: true,
    });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations
  ).toEqual([]);
  await dialog.getByRole("button", { name: "Next page", exact: true }).click();
  await dialog.getByRole("button", { name: "Receipt 00.pdf", exact: true }).click();
  await expect(page.getByLabel("Reply text", { exact: true })).toHaveValue(
    "Unfinished correspondence is preserved."
  );
  await expect(page.locator('input[name="evidenceFileId"]')).not.toHaveValue("");
  await page.getByLabel("Reply evidence (optional)").click();
  await dialog.getByLabel("Masked filename").fill("Receipt 30");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog).toContainText("Showing 1 of 1 matching files");
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Reply evidence (optional)")).toBeFocused();
  await expect(page.getByText("Receipt 00.pdf", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 860 });
  for (const path of [
    "/requests?cursor=broken",
    "/requests?status=invalid",
    "/requests?status=FAILED&status=CLOSED",
    "/evidence?requestCursor=broken",
    "/brokers?category=invalid",
    "/requests/new?brokers=a&brokers=b",
    "/reports?cursor=broken",
    "/responses?filter=invalid",
    `/requests/${id}?historyCursor=broken`,
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("alert").filter({ hasText: "These filters" })
    ).toContainText("These filters or page links are invalid");
    await expect(page.locator("h1")).toHaveCount(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    ).toBe(false);
    await page.getByRole("link", { name: "Reset filters and open first page" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "These filters" })
    ).toHaveCount(0);
  }
  for (const path of [
    `/evidence?requestId=${foreignId}`,
    `/requests/${foreignId}/review`,
    `/requests/${foreignId}/responses/new`,
  ]) {
    expect((await page.goto(path))?.status()).toBe(404);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Return to dashboard" })).toBeVisible();
  }
});
