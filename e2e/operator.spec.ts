import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { accountEmailIndex } from "../lib/security/accountEmail";
import { seedJurisdictions } from "../prisma/seeds/jurisdictions";
import { DEFAULT_TEMPLATE_SOURCE } from "../lib/templates/authoring";
import { resetBrowserAuthenticationLimit, signIn } from "./helpers";

test.beforeAll(resetBrowserAuthenticationLimit);

test("curates a broker with verified contacts and coverage, then edits operational settings", async ({
  page,
  baseURL,
}) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
  expect(new URL(process.env.DATABASE_URL!).pathname).toMatch(/_test$/);
  expect(process.env.EMAIL_PROVIDER).toBe("mock");
  expect(process.env.ALLOW_EXTERNAL_SENDING).toBe("false");
  const email = `operator-${randomUUID()}@example.org`;
  await signIn(page, email);
  const db = new PrismaClient();
  let jurisdictionId: string;
  try {
    await seedJurisdictions(db);
    await db.user.update({
      where: { emailBi: accountEmailIndex(email) },
      data: { role: "INSTANCE_ADMIN" },
    });
    jurisdictionId = (await db.jurisdiction.findUniqueOrThrow({ where: { code: "DE" } }))
      .id;
  } finally {
    await db.$disconnect();
  }
  const slug = `browser-operator-${randomUUID()}`;
  const name = `Operator browser ${slug}`;
  await page.goto("/admin/brokers/new");
  await page.getByLabel("Legal name", { exact: true }).fill(name);
  await page.getByLabel("Catalogue key", { exact: true }).fill(slug);
  await page.getByLabel("Company website", { exact: true }).fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Create broker", exact: true }).click();
  await expect(
    page.getByText("Use an HTTP or HTTPS URL without embedded credentials.", {
      exact: true,
    })
  ).toBeVisible();
  await expect(page.getByLabel("Legal name", { exact: true })).toHaveValue(name);
  await page.getByLabel("Company website", { exact: true }).fill("https://example.org");
  await page
    .getByLabel("Primary source URL", { exact: true })
    .fill("https://example.org/privacy");
  await page
    .getByLabel("Last reviewed on", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await page
    .getByLabel("Verification stage", { exact: true })
    .selectOption("CONTACT_VERIFIED");
  await page.getByRole("button", { name: "Create broker", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/brokers\/[^/?]+\?saved=details/);
  const sending = page.locator("#sending");
  await sending.getByLabel("Allow sending to this broker").selectOption("true");
  await sending.getByRole("button", { name: "Save sending choice" }).click();
  await expect(sending.getByRole("alert")).toContainText("No verified contact method");
  await page.getByText("Add contact method", { exact: true }).click();
  const contact = page
    .locator("details")
    .filter({ has: page.getByText("Add contact method", { exact: true }) });
  await contact.getByLabel("Destination", { exact: true }).fill("privacy@example.org");
  await contact
    .getByLabel("I verified this destination against the source below", { exact: true })
    .selectOption("true");
  await contact
    .getByLabel("Verified on", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await contact
    .getByLabel("Verification source URL", { exact: true })
    .fill("https://example.org/privacy");
  await contact
    .getByLabel("Verification evidence and instructions", { exact: true })
    .fill("Synthetic browser verification. No contact was made with a real company.");
  await contact.getByRole("button", { name: "Add method", exact: true }).click();
  await expect(page).toHaveURL(/saved=contacts/);
  await page.getByText("Add jurisdiction coverage", { exact: true }).click();
  const coverage = page
    .locator("details")
    .filter({ has: page.getByText("Add jurisdiction coverage", { exact: true }) });
  await coverage.getByLabel("Jurisdiction", { exact: true }).selectOption(jurisdictionId);
  await coverage
    .getByLabel("Basis for coverage", { exact: true })
    .selectOption("STATUTORY");
  await coverage.getByLabel("deletion", { exact: true }).check();
  await coverage
    .getByLabel("Source and applicability conditions", { exact: true })
    .fill("Synthetic scope from https://example.org/privacy; this is browser test data.");
  await coverage.getByRole("button", { name: "Save coverage", exact: true }).click();
  await expect(page).toHaveURL(/saved=coverage/);
  await sending.getByLabel("Allow sending to this broker").selectOption("true");
  await sending.getByRole("button", { name: "Save sending choice" }).click();
  await expect(page.getByRole("status")).toContainText("Broker sending is enabled");
  // No real transport is configured; turn the synthetic catalogue switch off again.
  await sending.getByLabel("Allow sending to this broker").selectOption("false");
  await sending.getByRole("button", { name: "Save sending choice" }).click();
  await expect(page.getByRole("status")).toContainText("Broker sending is disabled");
  await page.goto("/admin/brokers");
  await page.getByLabel("Search brokers", { exact: true }).fill(slug);
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await page.goto("/admin/settings");
  const note = page.locator('[id="instance.operator_note"]');
  await note
    .getByLabel("Operator note", { exact: true })
    .fill("Browser-tested local instance");
  await note.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Setting saved.");
  await expect(note.getByLabel("Operator note", { exact: true })).toHaveValue(
    "Browser-tested local instance"
  );
  await note.getByRole("button", { name: "Use default", exact: true }).click();
  await expect(note.getByLabel("Operator note", { exact: true })).toHaveValue("");
});

test("drafts, repairs, previews, publishes and supersedes a template", async ({
  page,
  baseURL,
}) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
  expect(new URL(process.env.DATABASE_URL!).pathname).toMatch(/_test$/);
  expect(process.env.EMAIL_PROVIDER).toBe("mock");
  expect(process.env.ALLOW_EXTERNAL_SENDING).toBe("false");
  const email = `template-operator-${randomUUID()}@example.org`;
  await signIn(page, email);
  const db = new PrismaClient();
  try {
    await db.user.update({
      where: { emailBi: accountEmailIndex(email) },
      data: { role: "MAINTAINER" },
    });
  } finally {
    await db.$disconnect();
  }
  const key = `browser.template-${randomUUID()}`;
  const name = `Template ${key}`;
  await page.goto("/admin/templates/new");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Stable key", { exact: true }).fill(key);
  await page.getByLabel("Request type", { exact: true }).selectOption("CORRECTION");
  await page.getByLabel("Delivery channel", { exact: true }).selectOption("POSTAL");
  await page
    .getByLabel("Letter template", { exact: true })
    .fill("Hello {{profile.fullName}}");
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page).toHaveURL(
    /\/admin\/templates\/[^/]+\/versions\/[^/?]+\?saved=created/
  );
  const templateId = new URL(page.url()).pathname.split("/")[3]!;
  await expect(
    page.getByText("Before publishing, fix these items and save the draft:")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish this version" })).toHaveCount(0);
  const unsafe = DEFAULT_TEMPLATE_SOURCE.bodyTemplate + "\n{{unknown.variable}}";
  await page.getByLabel("Letter template", { exact: true }).fill(unsafe);
  await page.getByRole("button", { name: "Save draft and preview", exact: true }).click();
  await expect(
    page.getByText("Use only placeholders from the variable reference below.", {
      exact: true,
    })
  ).toBeVisible();
  await expect(page.getByLabel("Letter template", { exact: true })).toHaveValue(unsafe);
  await expect(page.getByLabel("Letter template", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true"
  );
  await page
    .getByLabel("Letter template", { exact: true })
    .fill(DEFAULT_TEMPLATE_SOURCE.bodyTemplate);
  await page
    .getByLabel("Review notes", { exact: true })
    .fill("Synthetic browser review. No external contact or real personal records.");
  await page.getByRole("button", { name: "Save draft and preview", exact: true }).click();
  await expect(page).toHaveURL(/saved=draft/);
  await expect(page.locator("#preview")).toContainText("Alex Sample");
  await page
    .getByLabel("I reviewed this saved version and its previews", { exact: true })
    .check();
  await page.getByRole("button", { name: "Publish this version", exact: true }).click();
  await expect(page).toHaveURL(/saved=published/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("version 1");
  await page.getByRole("button", { name: "Start a new draft", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("version 2");
  await expect(page.getByLabel("Review notes", { exact: true })).toHaveValue("");
  await page
    .getByLabel("Review notes", { exact: true })
    .fill("Second synthetic browser review, preserving published history.");
  await page
    .getByLabel("Letter template", { exact: true })
    .fill(DEFAULT_TEMPLATE_SOURCE.bodyTemplate + "\nSynthetic revision.");
  await page.getByRole("button", { name: "Save draft and preview", exact: true }).click();
  await page
    .getByLabel("I reviewed this saved version and its previews", { exact: true })
    .check();
  await page.getByRole("button", { name: "Publish this version", exact: true }).click();
  await page.getByRole("link", { name: "Back to template history", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Template version history" })
  ).toContainText("superseded");
  await page.getByRole("button", { name: "Deactivate template", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Template deactivated");
  const verify = new PrismaClient();
  try {
    const stored = await verify.requestTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: { versions: { orderBy: { version: "asc" } } },
    });
    expect(stored.isActive).toBe(false);
    expect(stored.versions.map((row) => row.status)).toEqual(["SUPERSEDED", "PUBLISHED"]);
    expect(stored.versions[0]!.bodyTemplate).toBe(DEFAULT_TEMPLATE_SOURCE.bodyTemplate);
    expect(stored.versions[1]!.bodyTemplate).toContain("Synthetic revision.");
  } finally {
    await verify.$disconnect();
  }
  await page.goto("/admin/templates");
  await page.getByLabel("Search templates", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});
