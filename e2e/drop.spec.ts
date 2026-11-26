import { randomUUID } from "node:crypto";
import { PrismaClient } from "./db";
import { seedJurisdictions } from "../prisma/seeds/jurisdictions";
import { seedLegalRules } from "../prisma/seeds/legalRules";
import { seedRequestTemplates } from "../prisma/seeds/templates";
import { expect, test } from "./fixtures";
import { fillProfile, resetBrowserAuthenticationLimit, signIn } from "./helpers";

test.beforeAll(resetBrowserAuthenticationLimit);

test("reviews DROP instructions and records a synthetic platform submission without a broker letter", async ({
  page,
}) => {
  const db = new PrismaClient();
  const name = `Browser DROP ${randomUUID()}`;
  let brokerId: string;
  try {
    await seedJurisdictions(db);
    await seedLegalRules(db);
    await seedRequestTemplates(db);
    const jurisdiction = await db.jurisdiction.findUniqueOrThrow({
      where: { code: "US-CA" },
    });
    brokerId = (
      await db.broker.create({
        data: {
          slug: `browser-drop-${randomUUID()}`,
          legalName: name,
          category: "PEOPLE_SEARCH",
          isDemoData: true,
          productionSendingEnabled: false,
          contactMethods: {
            create: {
              type: "DROP_PLATFORM",
              value: "https://privacy.ca.gov/drop/",
              isPreferred: true,
            },
          },
          jurisdictionCoverage: {
            create: {
              jurisdictionId: jurisdiction.id,
              supportedRequestTypes: ["DELETION"],
            },
          },
        },
      })
    ).id;
  } finally {
    await db.$disconnect();
  }
  const email = `drop-${randomUUID()}@example.org`;
  await signIn(page, email);
  await page.goto("/onboarding");
  await fillProfile(page, email, "Alex Platform");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/requests/new?brokers=${brokerId}`);
  await page.getByRole("radio", { name: "Deletion / erasure", exact: true }).check();
  await page.getByRole("button", { name: "Generate drafts" }).click();
  await expect(page).toHaveURL(/\/requests\?created=1/);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/requests\/[a-z0-9-]+$/i);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.getByRole("link", { name: "Review", exact: true }).click();
  await expect(
    page.getByText(/California Delete Act \(Civil Code sections/).first()
  ).toBeVisible();
  await page
    .getByText("Reveal the exact message (contains personal data)", { exact: true })
    .click();
  await expect(
    page.getByText(/Keep your private DROP ID outside this instance/).first()
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve for manual submission" }).click();
  await page.getByRole("link", { name: "Submit manually", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Complete your approved DROP steps" })
  ).toBeVisible();
  await expect(
    page.getByText(/Checking an existing status is not a new submission/)
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Record the platform outcome as a response" })
  ).toBeVisible();
  await expect(
    page.locator('input[name="dateOfBirth"], input[name="dropId"]')
  ).toHaveCount(0);
  // This is a local synthetic fixture. No browser navigation or request reaches DROP.
  await page
    .getByLabel(
      "I followed these approved instructions and personally submitted the platform request for this broker. These dates are accurate."
    )
    .check();
  await page.getByRole("button", { name: "Record submission", exact: true }).click();
  await expect(page).toHaveURL(/saved=submission/);
  const verify = new PrismaClient();
  try {
    const request = await verify.removalRequest.findUniqueOrThrow({
      where: { id },
      include: {
        manualSubmissions: true,
        legalRuleVersion: { include: { legalRule: true } },
      },
    });
    expect(request.status).toBe("WAITING_FOR_BROKER");
    expect(request.manualSubmissions).toHaveLength(1);
    expect(request.deadlineAt).toBeNull();
    expect(request.legalRuleVersion!.legalRule.key).toBe("ca-delete-act-drop");
    expect(await verify.outboundEmail.count({ where: { removalRequestId: id } })).toBe(0);
  } finally {
    await verify.$disconnect();
  }
});
