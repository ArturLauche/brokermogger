import { randomUUID } from "node:crypto";
import { PrismaClient } from "./db";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures";
import { signIn, resetBrowserAuthenticationLimit } from "./helpers";
import { seedJurisdictions } from "@/prisma/seeds/jurisdictions";
import { seedRealBrokerDrafts } from "@/prisma/seeds/realBrokers";
import { accountEmailIndex } from "@/lib/security/accountEmail";

test.beforeEach(resetBrowserAuthenticationLimit);

test("explains inactive real drafts and operator review work on desktop and mobile", async ({
  page,
}) => {
  const email = `readiness-${randomUUID()}@example.org`;
  await signIn(page, email);
  const db = new PrismaClient();
  try {
    await seedJurisdictions(db);
    await seedRealBrokerDrafts(db);
    await db.user.update({
      where: { emailBi: accountEmailIndex(email) },
      data: { role: "MAINTAINER" },
    });
    const draft = await db.broker.findUniqueOrThrow({ where: { slug: "epsilon" } });
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/brokers?search=Epsilon");
      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("link", { name: "Epsilon", exact: true }) });
      await expect(row).toContainText("Inactive real draft");
      await expect(row.getByRole("link", { name: /Prepare|Practise/ })).toHaveCount(0);
      await row.getByRole("link", { name: "Epsilon", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Verification readiness" })
      ).toBeVisible();
      await expect(
        page.getByText("New requests are disabled for this inactive entry.")
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Open the published method" })
      ).toHaveAttribute("href", "https://legal.epsilon.com/dsr");
      await page.goto("/admin/brokers?status=real_drafts&search=Epsilon");
      await page.getByRole("link", { name: "Epsilon", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Before enabling this broker" })
      ).toBeVisible();
      await expect(
        page.getByText("No verified contact method is available.", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText("The broker has no last verified date.", { exact: true })
      ).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
            .analyze()
        ).violations
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
      ).toBe(true);
      await page.goto("/admin/brokers?status=stale&search=Epsilon");
      await expect(
        page.getByRole("link", { name: "Epsilon", exact: true })
      ).toBeVisible();
      await page.getByLabel("Search brokers", { exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(page.getByLabel("Show", { exact: true })).toBeFocused();
      await page.goto("/admin/legal-rules?status=review");
      const search = page.getByLabel("Search legal rules", { exact: true });
      await expect(search).toBeVisible();
      if (width === 375)
        expect((await search.boundingBox())!.width).toBeGreaterThanOrEqual(240);
      await search.fill("no-such-review-rule");
      await search.press("Enter");
      await expect(
        page.getByRole("heading", { name: "No matching rules" })
      ).toBeVisible();
    }
    expect(await db.broker.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({
      isActive: false,
      productionSendingEnabled: false,
    });
  } finally {
    await db.$disconnect();
  }
});
