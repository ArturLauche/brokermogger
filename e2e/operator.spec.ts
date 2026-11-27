import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import { PrismaClient } from "./db";
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

test("sources, repairs, publishes and schedules legal versions while preserving current law", async ({
  page,
  baseURL,
}) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
  expect(new URL(process.env.DATABASE_URL!).pathname).toMatch(/_test$/);
  expect(process.env.EMAIL_PROVIDER).toBe("mock");
  expect(process.env.ALLOW_EXTERNAL_SENDING).toBe("false");
  const email = "legal-operator-" + randomUUID() + "@example.org";
  await signIn(page, email);
  const db = new PrismaClient();
  let jurisdictionId: string;
  try {
    await seedJurisdictions(db);
    await db.user.update({
      where: { emailBi: accountEmailIndex(email) },
      data: { role: "MAINTAINER" },
    });
    jurisdictionId = (await db.jurisdiction.findUniqueOrThrow({ where: { code: "DE" } }))
      .id;
  } finally {
    await db.$disconnect();
  }
  const key = "browser.legal-" + randomUUID();
  const name = "Browser legal " + key;
  await page.goto("/admin/legal-rules/new");
  await page
    .getByLabel("Law or policy name", { exact: true })
    .fill("Synthetic browser rule");
  await page.getByLabel("Short name", { exact: true }).fill(name);
  await page.getByLabel("Stable key", { exact: true }).fill(key);
  await page.getByLabel("Jurisdiction", { exact: true }).selectOption(jurisdictionId);
  await expect(
    page.getByRole("checkbox", { name: "California DROP", exact: true })
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: "Postal", exact: true }).uncheck();
  await page
    .getByLabel("Legal basis in letters", { exact: true })
    .fill("Article 17 of Regulation (EU) 2016/679 where its scope and conditions apply");
  await page
    .getByLabel("Applicability and risks", { exact: true })
    .fill(
      "Synthetic browser fixture. Review territorial scope, controller identity and exemptions; no legal guarantee."
    );
  await page
    .getByLabel("Response-period unit", { exact: true })
    .selectOption("CALENDAR_MONTHS");
  await page.getByLabel("Response period", { exact: true }).fill("1");
  await page
    .getByLabel("Period checked against primary source", { exact: true })
    .selectOption("true");
  await page
    .getByLabel("Manual escalation instructions", { exact: true })
    .fill(
      "Review competent authority guidance and prepare any complaint manually. No external contact in this fixture."
    );
  await page
    .getByLabel("Primary source URL", { exact: true })
    .fill("https://example.org/law");
  await page
    .getByLabel("Primary source title", { exact: true })
    .fill("Synthetic fixture referencing GDPR");
  await page
    .getByLabel("Actually reviewed on", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await page
    .getByLabel("Reviewer attribution", { exact: true })
    .fill("Synthetic browser fixture, not counsel");
  await page
    .getByLabel("Effective from (UTC)", { exact: true })
    .fill("2018-05-25T00:00:00.000Z");
  await page.getByRole("button", { name: "Create legal draft", exact: true }).click();
  await expect(page.getByLabel("Primary source URL", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true"
  );
  await expect(page.getByLabel("Short name", { exact: true })).toHaveValue(name);
  await page
    .getByLabel("Primary source URL", { exact: true })
    .fill("https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng");
  await page.getByRole("button", { name: "Create legal draft", exact: true }).click();
  await expect(page).toHaveURL(
    /\/admin\/legal-rules\/[^/]+\/versions\/[^/?]+\?saved=created/
  );
  const legalRuleId = new URL(page.url()).pathname.split("/")[3]!;
  await expect(page.getByRole("button", { name: "Publish legal version" })).toHaveCount(
    0
  );
  await expect(page.locator("#preview")).toContainText("2026-02-28");
  await page.getByLabel("Actually reviewed on", { exact: true }).fill("9998-01-01");
  await page
    .getByLabel("Review notes", { exact: true })
    .fill(
      "Synthetic review of scope, primary sources, month arithmetic and manual instructions."
    );
  await page
    .getByRole("button", { name: "Save legal draft and preview", exact: true })
    .click();
  await expect(page.getByLabel("Actually reviewed on", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true"
  );
  await expect(page.getByLabel("Actually reviewed on", { exact: true })).toHaveValue(
    "9998-01-01"
  );
  await page
    .getByLabel("Actually reviewed on", { exact: true })
    .fill(new Date().toISOString().slice(0, 10));
  await page
    .getByRole("button", { name: "Save legal draft and preview", exact: true })
    .click();
  await expect(page).toHaveURL(/saved=draft/);
  await page.locator("#preview").getByText("deletion letter", { exact: true }).click();
  await expect(page.locator("#preview")).toContainText("Alex Sample");
  await page
    .getByLabel("I reviewed this saved legal version and its sources", { exact: true })
    .check();
  await page.getByRole("button", { name: "Publish legal version", exact: true }).click();
  await expect(page).toHaveURL(/saved=published/);
  await page
    .getByRole("button", { name: "Start a new legal draft", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("version 2");
  await page
    .getByLabel("Review notes", { exact: true })
    .fill("Synthetic correction preserving published source and historical snapshots.");
  await page
    .getByLabel("Legal basis in letters", { exact: true })
    .fill(
      "Article 17 of Regulation (EU) 2016/679, subject to applicable conditions and exceptions"
    );
  await page
    .getByRole("button", { name: "Save legal draft and preview", exact: true })
    .click();
  await page
    .getByLabel("I reviewed this saved legal version and its sources", { exact: true })
    .check();
  await page.getByRole("button", { name: "Publish legal version", exact: true }).click();
  await page
    .getByRole("button", { name: "Start a new legal draft", exact: true })
    .click();
  const future = new Date().getUTCFullYear() + 1 + "-01-01T00:00:00.000Z";
  await page.getByLabel("Effective from (UTC)", { exact: true }).fill(future);
  await page
    .getByLabel("Review notes", { exact: true })
    .fill(
      "Synthetic future-effective revision; the current version must remain published."
    );
  await page
    .getByRole("button", { name: "Save legal draft and preview", exact: true })
    .click();
  await page
    .getByLabel("I reviewed this saved legal version and its sources", { exact: true })
    .check();
  await page.getByRole("button", { name: "Publish legal version", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("version 3");
  await expect(
    page.getByText(/Scheduled for .*not selected before that time/)
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to legal history", exact: true }).click();
  await expect(page.getByRole("region", { name: "Legal version history" })).toContainText(
    "superseded"
  );
  await expect(page.getByRole("region", { name: "Legal version history" })).toContainText(
    "scheduled"
  );
  await page.getByRole("button", { name: "Deactivate legal rule", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Rule deactivated");
  const verify = new PrismaClient();
  try {
    const row = await verify.legalRule.findUniqueOrThrow({
      where: { id: legalRuleId },
      include: { versions: { orderBy: { version: "asc" } } },
    });
    expect(row.isActive).toBe(false);
    expect(row.versions.map((version) => version.status)).toEqual([
      "SUPERSEDED",
      "PUBLISHED",
      "PUBLISHED",
    ]);
    expect(row.versions[0]!.legalBasisText).toBe(
      "Article 17 of Regulation (EU) 2016/679 where its scope and conditions apply"
    );
    expect(row.versions[2]!.effectiveFrom.toISOString()).toBe(future);
    for (const version of row.versions)
      expect(version.verificationRequirements).toMatchObject({
        allowedChannels: ["API", "EMAIL", "WEB_FORM"],
      });
  } finally {
    await verify.$disconnect();
  }
  await page.goto("/admin/legal-rules");
  await page.getByLabel("Search legal rules", { exact: true }).fill(key);
  await page.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});
