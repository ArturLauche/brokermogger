import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import { PrismaClient } from "./db";
import type { Route } from "@playwright/test";
import { seedJurisdictions } from "../prisma/seeds/jurisdictions";
import { seedLegalRules } from "../prisma/seeds/legalRules";
import { seedRequestTemplates } from "../prisma/seeds/templates";
import {
  resetBrowserAuthenticationLimit,
  signIn,
  fillProfile,
  makeBrowserJobDue,
} from "./helpers";

test.beforeAll(resetBrowserAuthenticationLimit);

test("edits and approves a manual request, records submission, then confirms a reply", async ({
  page,
  baseURL,
}) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
  const url = new URL(process.env.DATABASE_URL!);
  expect(url.pathname).toMatch(/_test$/);
  expect(process.env.EMAIL_PROVIDER).toBe("mock");
  expect(process.env.ALLOW_EXTERNAL_SENDING).toBe("false");
  const db = new PrismaClient();
  const brokerName = `Browser portal ${randomUUID()}`;
  let brokerId: string;
  try {
    await seedJurisdictions(db);
    await seedLegalRules(db);
    await seedRequestTemplates(db);
    const jurisdiction = await db.jurisdiction.findFirstOrThrow({
      where: { countryCode: "DE" },
    });
    const broker = await db.broker.create({
      data: {
        slug: `browser-${randomUUID()}`,
        legalName: brokerName,
        category: "PEOPLE_SEARCH",
        isDemoData: true,
        productionSendingEnabled: false,
        contactMethods: {
          create: {
            type: "WEB_FORM",
            value: "https://example.org/privacy",
            isPreferred: true,
          },
        },
        jurisdictionCoverage: { create: { jurisdictionId: jurisdiction.id } },
      },
    });
    brokerId = broker.id;
  } finally {
    await db.$disconnect();
  }
  const email = `correspondence-${randomUUID()}@example.org`;
  await signIn(page, email);
  await page.goto("/onboarding");
  await fillProfile(page, email, "Alex Correspondence");
  await page.getByLabel("Country of residence").selectOption("DE");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(`/requests/new?brokers=${brokerId}`);
  await page.getByLabel(`${brokerName} (demo)`, { exact: true }).check();
  const identifiers = page.locator('input[name="identifierId"]');
  for (const identifier of await identifiers.all()) await identifier.uncheck();
  await page.getByRole("button", { name: "Generate drafts" }).click();
  await expect(
    page.getByText("Select at least one matching identifier.", { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel(`${brokerName} (demo)`, { exact: true })).toBeChecked();
  for (const identifier of await identifiers.all()) await identifier.check();
  await page.getByRole("button", { name: "Generate drafts" }).click();
  await expect(page).toHaveURL(/\/requests\?created=1/);
  await page.getByRole("link", { name: brokerName, exact: true }).click();
  await expect(page).toHaveURL(/\/requests\/[a-z0-9-]+$/i);
  const requestUrl = page.url();
  await page.goto(`/requests/new?brokers=${brokerId}`);
  await page.getByRole("button", { name: "Generate drafts" }).click();
  await expect(
    page.getByRole("link", { name: "Open request 1", exact: true })
  ).toBeVisible();
  await page.getByRole("link", { name: "Open request 1", exact: true }).click();
  await expect(page).toHaveURL(requestUrl);
  await page.getByRole("link", { name: "Edit draft", exact: true }).click();
  const letter = await page.getByLabel("Request letter").inputValue();
  await page
    .getByLabel("Request letter")
    .fill(`${letter}\n\nPlease confirm receipt in writing.`);
  await page.getByRole("button", { name: "Save and review" }).click();
  await expect(page).toHaveURL(/\/review/);
  await expect(page.getByText(/Please confirm receipt in writing/)).toBeHidden();
  await page
    .getByText("Reveal the exact message (contains personal data)", { exact: true })
    .click();
  await expect(page.getByText(/Please confirm receipt in writing/)).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve for manual submission" }).click();
  await expect(page).toHaveURL(/\/requests\/[a-z0-9-]+$/i);
  await page.getByRole("link", { name: "Submit manually" }).click();
  await expect(
    page.getByRole("heading", { name: "Submit your approved request" })
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download approved text" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.txt$/);
  await page
    .getByLabel(
      "I submitted this exact approved message myself, and these dates are accurate."
    )
    .check();
  await page.getByRole("button", { name: "Record submission", exact: true }).click();
  await expect(page).toHaveURL(/saved=submission/);
  await expect(
    page.getByText("Estimated response target", { exact: true })
  ).toBeVisible();
  await page.getByText("Record original receipt date", { exact: true }).click();
  const receiptDate = page.getByLabel("Original request receipt date", { exact: true });
  await receiptDate.fill((await receiptDate.getAttribute("max"))!);
  await page
    .getByLabel("I checked the receipt of the original request and confirm this date.")
    .check();
  await page.getByRole("button", { name: "Record receipt date", exact: true }).click();
  await expect(page).toHaveURL(/saved=receipt/);
  await expect(
    page.getByText("Correct original receipt date", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Public-holiday coverage is unverified or incomplete/)
  ).toBeVisible();
  await page.getByRole("button", { name: "Prepare follow-up", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Follow-up scheduled", exact: true })
  ).toBeVisible();
  const requestId = new URL(requestUrl).pathname.split("/").at(-1)!;
  await processFollowUp(requestId, true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Follow-up preparation needs a retry" })
  ).toBeVisible();
  // Hold the retry POST so the fixture exercises an action still in flight.
  let releaseRetry!: () => void;
  const retryGate = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  const retryPattern = `**/requests/${requestId}**`;
  const delayRetry = async (route: Route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"])
      await retryGate;
    await route.continue();
  };
  await page.route(retryPattern, delayRetry);
  try {
    await page.getByRole("button", { name: "Retry preparation", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Scheduling…", exact: true })
    ).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Follow-up preparation needs a retry" })
    ).toBeVisible();
    releaseRetry();
    await expect(
      page.getByRole("heading", { name: "Follow-up scheduled", exact: true })
    ).toBeVisible();
  } finally {
    releaseRetry();
    await page.unrouteAll({ behavior: "wait" });
  }
  await processFollowUp(requestId);
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByRole("link", { name: "Review", exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Submit manually", exact: true })
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Review", exact: true }).click();
  await page
    .getByText("Reveal the exact message (contains personal data)", { exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve for manual submission" }).click();
  await page.getByRole("link", { name: "Submit manually" }).click();
  await page
    .getByLabel(
      "I submitted this exact approved message myself, and these dates are accurate."
    )
    .check();
  await page.getByRole("button", { name: "Record submission", exact: true }).click();
  await expect(page).toHaveURL(/saved=submission/);
  await page.getByRole("button", { name: "Prepare final reminder", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Final reminder scheduled", exact: true })
  ).toBeVisible();
  await processFollowUp(requestId, false, 2);
  await page.getByRole("button", { name: "Refresh status" }).click();
  await page.getByRole("link", { name: "Review", exact: true }).click();
  await page
    .getByText("Reveal the exact message (contains personal data)", { exact: true })
    .click();
  await expect(
    page.getByText(/^Subject: Final reminder: privacy request/).first()
  ).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve for manual submission" }).click();
  await page.getByRole("link", { name: "Submit manually" }).click();
  await page
    .getByLabel(
      "I submitted this exact approved message myself, and these dates are accurate."
    )
    .check();
  await page.getByRole("button", { name: "Record submission", exact: true }).click();
  await expect(page).toHaveURL(/saved=submission/);
  await expect(
    page.getByRole("button", { name: "Prepare follow-up", exact: true })
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Broker responses" }).click();
  await page.getByRole("link", { name: "Record a reply", exact: true }).click();
  await page.getByLabel("Reply subject or label").fill("Some records remain");
  await page
    .getByLabel("Reply text", { exact: true })
    .fill("We completed part of this request. Some records remain under review.");
  await page.getByRole("button", { name: "Save reply and review" }).click();
  await page.getByLabel("What does this reply say?").selectOption("PARTIALLY_COMPLETED");
  await page.getByLabel(/Change the request status to Partially completed/).check();
  await page
    .getByLabel(
      "I reviewed the reply and confirm this classification and the selected status action."
    )
    .check();
  await page.getByRole("button", { name: "Confirm response", exact: true }).click();
  await expect(page).toHaveURL(/saved=confirmed/);
  await page.goto(requestUrl);
  await page
    .getByRole("button", { name: "Prepare escalation summary", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Prepare your next step", exact: true })
  ).toBeVisible();
  const summary = await page.request.get(`/api/requests/${requestId}/escalation`);
  expect(summary.status()).toBe(200);
  expect(summary.headers()["cache-control"]).toContain("no-store");
  const summaryText = await summary.text();
  expect(summaryText).toContain("Manual submissions: 3");
  expect(summaryText).not.toContain("Alex Correspondence");
  await page.getByRole("link", { name: "Return to request", exact: true }).click();
  await page.getByRole("tab", { name: "Broker responses" }).click();
  await page.getByRole("link", { name: "Record a reply", exact: true }).click();
  await page.getByLabel("Reply subject or label").fill("Deletion confirmation");
  await page
    .getByLabel("Reply text", { exact: true })
    .fill("We have deleted your data. Reference: Alex Correspondence.");
  await page.getByRole("button", { name: "Save reply and review" }).click();
  await expect(page).toHaveURL(/\/responses\/.+saved=recorded/);
  await expect(
    page.getByText("We have deleted your data. Reference: Alex Correspondence.", {
      exact: true,
    })
  ).not.toBeVisible();
  await page
    .getByText("Reveal reply (may contain personal data)", { exact: true })
    .click();
  await expect(
    page.getByText("We have deleted your data. Reference: Alex Correspondence.", {
      exact: true,
    })
  ).toBeVisible();
  await page.getByLabel("Change the request status to Completed.").check();
  await page
    .getByLabel(
      "I reviewed the reply and confirm this classification and the selected status action."
    )
    .check();
  await page.getByRole("button", { name: "Confirm response", exact: true }).click();
  await expect(page).toHaveURL(/saved=confirmed/);
  await page.goto(requestUrl);
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  await page.goto(`${requestUrl}/review`);
  await expect(page.getByRole("button", { name: /Approve/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to draft" })).toHaveCount(0);
  await page.goto(`${requestUrl}/edit`);
  await expect(page.getByRole("button", { name: "Save and review" })).toHaveCount(0);

  await page.goto("/reports");
  const originalStart = await page.getByLabel("From", { exact: true }).inputValue();
  const originalEnd = await page.getByLabel("To, inclusive").inputValue();
  await page.getByLabel("To, inclusive").fill("2020-01-01");
  await page.getByRole("button", { name: "Generate report", exact: true }).click();
  await expect(
    page.getByText("The end date must be on or after the start date.")
  ).toBeVisible();
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(originalStart);
  await page.getByLabel("To, inclusive").fill(originalEnd);
  await page.getByRole("button", { name: "Generate report", exact: true }).click();
  await expect(page).toHaveURL(/\/reports\?queued=/);
  const reportId = new URL(page.url()).searchParams.get("queued")!;
  await processReport(reportId);
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByRole("link", { name: "Download JSON" })).toBeVisible();
  const response = await page.request.get(`/api/reports/${reportId}/download`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["content-disposition"]).toContain("brokermogger-report-");
  const payload = await response.json();
  expect(payload.requests).toHaveLength(1);
  expect(payload.requests[0].status).toBe("COMPLETED");
  expect(payload.brokersContacted).toEqual([brokerName]);
  expect(JSON.stringify(payload)).not.toContain("Alex Correspondence");
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Your report is ready" })).toBeVisible();
  await page.goto("/settings/privacy/exports");
  await expect(page.getByRole("radio", { name: /Masked account export/ })).toBeChecked();
  await page.getByRole("radio", { name: /Sensitive account export/ }).check();
  await page.getByRole("button", { name: "Create export", exact: true }).click();
  await expect(
    page.getByText("Confirm that you want a copy containing unmasked personal data.")
  ).toBeVisible();
  await page
    .getByLabel("I confirm that I want an export containing unmasked personal data.")
    .check();
  await page.getByRole("button", { name: "Create export", exact: true }).click();
  await expect(page).toHaveURL(/exports\?queued=/);
  const exportId = new URL(page.url()).searchParams.get("queued")!;
  await processExport(exportId);
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(page.getByRole("link", { name: "Download sensitive JSON" })).toBeVisible();
  const sensitive = await page.request.get(`/api/account/exports/${exportId}/download`);
  expect(sensitive.status()).toBe(200);
  const personal = await sensitive.json();
  expect(personal.mode).toBe("SENSITIVE");
  expect(personal.profiles[0].legalName).toBe("Alex Correspondence");
  expect(
    personal.responses.some((reply: { content: { body: string } }) =>
      reply.content.body.includes("We have deleted your data.")
    )
  ).toBe(true);
  const masked = await page.request.get("/api/account/export");
  expect(masked.status()).toBe(200);
  const maskedText = await masked.text();
  expect(maskedText).not.toContain("Alex Correspondence");
  expect(maskedText).not.toContain("We have deleted your data.");
  await page.getByRole("button", { name: "Delete copy", exact: true }).click();
  await expect(
    page.getByText(
      "Download access is disabled. Any stored copy is scheduled for cleanup."
    )
  ).toBeVisible();
  expect(
    (await page.request.get(`/api/account/exports/${exportId}/download`)).status()
  ).toBe(404);
});

/** Drive the actual leased worker path only in the guarded local browser database. */
async function processReport(reportId: string) {
  const db = new PrismaClient();
  try {
    const report = await db.report.findUniqueOrThrow({ where: { id: reportId } });
    await makeBrowserJobDue(db, report.jobId!);
    const { claimDueJobs } = await import("../lib/db/repositories/jobs");
    const { runClaimedJob } = await import("../lib/jobs/queue");
    const { renderReportForJob } = await import("../lib/reports/service");
    const [job] = await claimDueJobs("browser-report", 1);
    expect(job!.id).toBe(report.jobId);
    await runClaimedJob(job!, { GENERATE_REPORT: renderReportForJob });
  } finally {
    await db.$disconnect();
  }
}

async function processExport(exportId: string) {
  const db = new PrismaClient();
  try {
    const data = await db.accountExport.findUniqueOrThrow({ where: { id: exportId } });
    await makeBrowserJobDue(db, data.jobId!);
    const { claimDueJobs } = await import("../lib/db/repositories/jobs");
    const { runClaimedJob } = await import("../lib/jobs/queue");
    const { generateAccountExport } = await import("../lib/exports/service");
    const [job] = await claimDueJobs("browser-export", 1);
    expect(job!.id).toBe(data.jobId);
    await runClaimedJob(job!, { GENERATE_ACCOUNT_EXPORT: generateAccountExport });
  } finally {
    await db.$disconnect();
  }
}

async function processFollowUp(
  requestId: string,
  injectFailure = false,
  followUpNumber = 1
) {
  const db = new PrismaClient();
  try {
    const row = await db.backgroundJob.findUniqueOrThrow({
      where: { idempotencyKey: `follow-up:${requestId}:${followUpNumber}` },
    });
    if (injectFailure) {
      expect(row.status).toBe("PENDING");
      await db.backgroundJob.update({
        where: { id: row.id },
        data: { status: "FAILED", attemptCount: row.maxAttempts },
      });
      return;
    }
    // Exercise a deliberately delayed synthetic preparation before advancing it.
    await db.$executeRaw`
      UPDATE "BackgroundJob" SET "runAt" = NOW() + INTERVAL '1 minute'
      WHERE "id" = ${row.id}
    `;
    const [scheduled] = await db.$queryRaw<{ future: boolean }[]>`
      SELECT "runAt" > NOW() AS future FROM "BackgroundJob" WHERE "id" = ${row.id}
    `;
    expect(scheduled?.future).toBe(true);
    const untouched = await db.backgroundJob.findUniqueOrThrow({ where: { id: row.id } });
    expect(untouched.status).toBe(row.status);
    expect(untouched.attemptCount).toBe(row.attemptCount);
    expect(untouched.leaseToken).toBeNull();
    await makeBrowserJobDue(db, row.id);
    const { claimDueJobs } = await import("../lib/db/repositories/jobs");
    const { runClaimedJob } = await import("../lib/jobs/queue");
    const { createJobHandlers } = await import("../lib/jobs/handlers");
    const [job] = await claimDueJobs("browser-follow-up", 1);
    expect(job?.id).toBe(row.id);
    await runClaimedJob(job!, createJobHandlers());
    expect(
      (await db.backgroundJob.findUniqueOrThrow({ where: { id: row.id } })).status
    ).toBe("COMPLETED");
  } finally {
    await db.$disconnect();
  }
}
