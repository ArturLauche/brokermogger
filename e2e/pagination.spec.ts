import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { accountEmailIndex } from "../lib/security/accountEmail";
import { seedJurisdictions } from "../prisma/seeds/jurisdictions";
import { seedLegalRules } from "../prisma/seeds/legalRules";
import { seedRequestTemplates } from "../prisma/seeds/templates";
import { expect, test } from "./fixtures";
import { fillProfile, resetBrowserAuthenticationLimit, signIn } from "./helpers";

test.beforeAll(resetBrowserAuthenticationLimit);

test("reaches older requests and retains broker choices across searches and pages", async ({
  page,
}) => {
  const marker = `Paged ${randomUUID().slice(0, 8)}`;
  const email = `pages-${randomUUID()}@example.org`;
  await signIn(page, email);
  await page.goto("/onboarding");
  await fillProfile(page, email, "Alex Pages");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const db = new PrismaClient();
  let oldRequestId: string;
  try {
    await seedJurisdictions(db);
    await seedLegalRules(db);
    await seedRequestTemplates(db);
    const user = await db.user.findUniqueOrThrow({
      where: { emailBi: accountEmailIndex(email) },
    });
    const profile = await db.userProfile.findFirstOrThrow({
      where: { ownerUserId: user.id, kind: "SELF" },
    });
    const jurisdiction = await db.jurisdiction.findUniqueOrThrow({
      where: { code: "US-CA" },
    });
    const brokerIds = Array.from({ length: 32 }, () => randomUUID());
    await db.broker.createMany({
      data: brokerIds.map((id, index) => ({
        id,
        slug: `page-${id}`,
        legalName: `${marker} ${String(index).padStart(2, "0")}`,
        category: "PEOPLE_SEARCH",
        isDemoData: true,
        productionSendingEnabled: false,
      })),
    });
    await db.brokerContactMethod.createMany({
      data: brokerIds.map((brokerId) => ({
        brokerId,
        type: "EMAIL",
        value: "privacy@example.org",
        isPreferred: true,
      })),
    });
    await db.brokerJurisdictionCoverage.createMany({
      data: brokerIds.map((brokerId) => ({
        brokerId,
        jurisdictionId: jurisdiction.id,
        supportedRequestTypes: ["DELETION"],
      })),
    });
    const requests = Array.from({ length: 126 }, (_, index) => ({
      id: randomUUID(),
      userId: user.id,
      profileId: profile.id,
      brokerId: brokerIds[0]!,
      jurisdictionId: jurisdiction.id,
      requestType: "DELETION" as const,
      channel: "EMAIL" as const,
      status: "COMPLETED" as const,
      legalBasisText: "Synthetic paging fixture",
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    }));
    oldRequestId = requests[0]!.id;
    await db.removalRequest.createMany({ data: requests });
    await db.evidenceFile.create({
      data: {
        userId: user.id,
        profileId: profile.id,
        removalRequestId: oldRequestId,
        kind: "OTHER",
        storageKey: randomUUID(),
        storageBackend: "local",
        contentType: "application/pdf",
        byteSize: 100,
        checksumSha256: "a".repeat(64),
        expiresAt: new Date("2000-01-01"),
      },
    });
  } finally {
    await db.$disconnect();
  }

  await page.goto("/requests?status=COMPLETED");
  await expect(page.getByText(/126 matching requests/)).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(26);
  await page
    .getByRole("navigation", { name: "Request results pages" })
    .getByRole("link", { name: /Next page/ })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("status"))
    .toBe("COMPLETED");
  await expect
    .poll(() => Boolean(new URL(page.url()).searchParams.get("cursor")))
    .toBe(true);
  await page.getByLabel("Broker name or request reference").fill(oldRequestId);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText(/1 matching request/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open", exact: true })).toHaveAttribute(
    "href",
    `/requests/${oldRequestId}`
  );

  await page.goto("/requests/new");
  await page.getByLabel("Find a broker", { exact: true }).fill(marker);
  await page.getByRole("button", { name: "Search brokers" }).click();
  await expect(page.getByRole("status")).toContainText("32 matching brokers");
  const first = page.locator('input[name="brokerId"]').first();
  const firstId = await first.getAttribute("value");
  await first.check();
  await page
    .getByRole("navigation", { name: "Broker choices pages" })
    .getByRole("link", { name: /Next page/ })
    .click();
  await expect
    .poll(() => Boolean(new URL(page.url()).searchParams.get("cursor")))
    .toBe(true);
  await expect(page.locator(`input[name="brokerId"][value="${firstId}"]`)).toBeChecked();
  await page.locator('input[name="brokerId"]:not(:checked)').first().check();
  await page
    .getByLabel("Find a broker", { exact: true })
    .fill("No such synthetic broker");
  await page.getByRole("button", { name: "Search brokers" }).click();
  await expect(page.getByRole("status")).toContainText("2 selected · 0 matching brokers");
  await expect(page.locator('input[name="brokerId"]:checked')).toHaveCount(2);
  await page.getByRole("button", { name: "Generate drafts" }).click();
  await expect(page).toHaveURL(/\/requests\?created=2/);

  await page.goto(`/evidence?requestId=${oldRequestId}`);
  await expect(page.getByLabel("Request (optional)", { exact: true })).toHaveValue(
    oldRequestId
  );
  await expect(
    page.getByText("Expired · download unavailable", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 900 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
  ).toBe(true);
});
