import { createLogger } from "@/lib/observability/logger";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { env } from "../../lib/config/env";
import { readAccountEmail, encryptedAccountEmail } from "../../lib/security/accountEmail";
import { signIn, resetBrowserAuthenticationLimit } from "../../e2e/helpers";
import { generateRequests } from "../../lib/requests/generation";
import { testActor } from "./actor";
import { randomUUID } from "node:crypto";
import { saveOnboardingRecord } from "../../lib/db/repositories/onboarding";
import { seedJurisdictions } from "../../prisma/seeds/jurisdictions";
import { seedLegalRules } from "../../prisma/seeds/legalRules";
import { seedRequestTemplates } from "../../prisma/seeds/templates";
import { getOwnedRequest } from "../../lib/db/repositories/requests";
import { approveRequest } from "../../lib/requests/approval";
import { recordManualSubmission } from "../../lib/requests/manual";
import { confirmResponse, recordResponse } from "../../lib/responses/service";

/** Add synthetic records through the actual workflows, without resetting any schema. */
async function createFixture(db: PrismaClient) {
  await seedJurisdictions(db);
  await seedLegalRules(db);
  await seedRequestTemplates(db);
  const id = randomUUID();
  const email = `interface-${id}@example.org`;
  const user = await db.user.create({
    data: { id, ...encryptedAccountEmail(id, email), role: "INSTANCE_ADMIN" },
  });
  const actor = testActor(id, "INSTANCE_ADMIN");
  const setup = await saveOnboardingRecord(actor, {
    profileId: null,
    complete: true,
    identifiers: [],
    profile: {
      displayName: "Personal profile",
      legalName: "Alex Sample",
      contactEmail: email,
      countryCode: "DE",
      region: null,
      residencyConfirmed: true,
    },
  });
  const identifier = await db.profileIdentifier.findFirstOrThrow({
    where: { profileId: setup.profileId, type: "EMAIL", deletedAt: null },
  });
  const jurisdiction = await db.jurisdiction.findFirstOrThrow({
    where: { countryCode: "DE" },
  });
  const broker = await db.broker.create({
    data: {
      slug: `interface-${id}`,
      legalName: "Example broker",
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
  const result = await generateRequests(actor, {
    profileId: setup.profileId,
    brokerIds: [broker.id],
    identifierIds: [identifier.id],
    requestType: "DELETION",
  });
  const request = await getOwnedRequest(actor, result.requestIds[0]!);
  await approveRequest(actor, {
    requestId: request.id,
    envelopeHash: request.snapshots[0]!.envelopeHash,
    confirmationAccepted: true,
  });
  const date = new Date().toISOString().slice(0, 10);
  await recordManualSubmission(actor, {
    requestId: request.id,
    snapshotId: request.currentSnapshotId,
    submittedOn: date,
    receivedOn: date,
    evidenceFileId: null,
    confirmationAccepted: true,
  });
  const response = await recordResponse(actor, {
    requestId: request.id,
    submissionKey: randomUUID(),
    receivedOn: date,
    channel: "EMAIL",
    fromAddress: "privacy@example.org",
    subject: "Your privacy request",
    body: "We have completed the requested deletion. This is synthetic correspondence.",
    evidenceFileId: null,
  });
  await confirmResponse(actor, {
    responseId: response.id,
    expectedRevision: 0,
    expectedRequestStatus: "WAITING_FOR_BROKER",
    classification: "CONFIRMED_COMPLETED",
    applyToRequest: true,
    confirmationAccepted: true,
  });
  return user;
}

async function main() {
  if (
    !["localhost", "127.0.0.1"].includes(new URL(env.APP_BASE_URL).hostname) ||
    new URL(env.DATABASE_URL).pathname !== "/brokermogger_test" ||
    !env.DATABASE_URL.includes("schema=bm_e2e_workflows") ||
    env.EMAIL_PROVIDER !== "mock" ||
    env.ALLOW_EXTERNAL_SENDING
  )
    throw new Error(
      "Visual fixtures require the dedicated local browser database and mock transport."
    );
  const db = new PrismaClient();
  const browser = await chromium.launch();
  try {
    const savedFixture = await readFile(".tmp/interface-fixture.json", "utf8")
      .then(JSON.parse)
      .catch(() => null);
    const user =
      (savedFixture &&
        (await db.user.findFirst({
          where: {
            id: savedFixture.userId,
            status: "ACTIVE",
            removalRequests: { some: {} },
            profiles: {
              some: {
                deletedAt: null,
                kind: "SELF",
                onboardingCompletedAt: { not: null },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }))) ??
      (await createFixture(db));
    const request = await db.removalRequest.findFirstOrThrow({
      where: {
        userId: user.id,
        deletedAt: null,
        ...(savedFixture?.userId === user.id && savedFixture?.requestId
          ? { id: savedFixture.requestId }
          : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    const profile = await db.userProfile.findFirstOrThrow({
      where: { ownerUserId: user.id, deletedAt: null },
    });
    const identifier = await db.profileIdentifier.findFirstOrThrow({
      where: { profileId: profile.id, deletedAt: null },
    });
    const response = await db.brokerResponse.findFirst({
      where: { userId: user.id, deletedAt: null },
    });
    await db.user.update({ where: { id: user.id }, data: { role: "INSTANCE_ADMIN" } });
    let draft = await db.removalRequest.findFirst({
      where: {
        userId: user.id,
        deletedAt: null,
        status: { in: ["AWAITING_USER_APPROVAL", "MANUAL_REVIEW_REQUIRED"] },
      },
      select: { id: true },
    });
    if (!draft) {
      const result = await generateRequests(testActor(user.id, "INSTANCE_ADMIN"), {
        profileId: profile.id,
        brokerIds: [request.brokerId],
        identifierIds: [identifier.id],
        requestType: request.requestType,
      });
      draft = { id: result.requestIds[0]! };
    }
    const context = await browser.newContext({
      baseURL: env.APP_BASE_URL,
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const violations: { directive: string; resource: string }[] = [];
      Object.assign(window, { __bmUiViolations: violations });
      document.addEventListener("securitypolicyviolation", (event) => {
        violations.push({
          directive: event.effectiveDirective,
          resource: event.blockedURI,
        });
      });
    });
    await resetBrowserAuthenticationLimit();
    await signIn(page, readAccountEmail(user).email);
    await context.storageState({ path: ".tmp/interface-state.json" });
    const routes = [
      "/dashboard",
      "/onboarding",
      "/vault",
      `/vault/profiles/${profile.id}/edit`,
      `/vault/identifiers/${identifier.id}/edit`,
      "/household",
      "/brokers",
      `/brokers/${request.brokerId}`,
      "/requests",
      "/requests/new",
      `/requests/${request.id}`,
      `/requests/${request.id}/review`,
      `/requests/${request.id}/submit`,
      `/requests/${request.id}/edit`,
      `/requests/${request.id}/responses/new`,
      `/requests/${request.id}/escalation`,
      "/responses",
      ...(response ? [`/responses/${response.id}`] : []),
      "/notifications",
      "/evidence",
      "/reports",
      "/settings/account",
      "/settings/privacy",
      "/settings/privacy/exports",
      "/admin",
      "/admin/brokers",
      `/admin/brokers/${request.brokerId}`,
      "/admin/brokers/new",
      "/admin/legal-rules",
      "/admin/templates",
      "/admin/templates/new",
      "/admin/settings",
      "/admin/jobs",
      "/admin/audit",
      `/requests/${draft.id}/review`,
      `/requests/${draft.id}/edit`,
      "/",
      "/login",
      "/login/check-email",
      "/login/error",
      "/this-page-does-not-exist",
    ];
    await writeFile(
      ".tmp/interface-fixture.json",
      JSON.stringify({ userId: user.id, requestId: request.id })
    );
    const label = process.argv[2] ?? "before";
    const directory = `.tmp/interface-${label}`;
    await mkdir(directory, { recursive: true });
    const result = [];
    let routeIndex = 0;
    for (const route of routes) {
      routeIndex += 1;
      for (const width of [320, 375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        const response = await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.getByRole("main").waitFor();
        await page.waitForFunction(
          () =>
            document.readyState === "complete" &&
            ![...document.querySelectorAll("main [role=status]")].some((node) =>
              node.textContent?.startsWith("Loading")
            )
        );
        await page.screenshot({
          path: `${directory}/${routeIndex}-${width}.png`,
          fullPage: true,
        });
        const findings = await page.evaluate(() => ({
          title: document.title,
          h1: document.querySelectorAll("h1").length,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          width: document.documentElement.scrollWidth,
          missingLabels: [
            ...document.querySelectorAll("input:not([type=hidden]),textarea,select"),
          ].filter((node) => {
            const control = node as HTMLInputElement;
            return (
              !control.getAttribute("aria-label") &&
              !control.getAttribute("aria-labelledby") &&
              !control.labels?.length
            );
          }).length,
          csp:
            (
              window as Window & {
                __bmUiViolations?: { directive: string; resource: string }[];
              }
            ).__bmUiViolations ?? [],
        }));
        const accessibility =
          label === "after" && width === 375
            ? (
                await new AxeBuilder({ page })
                  .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
                  .analyze()
              ).violations.map((violation) => ({
                id: violation.id,
                impact: violation.impact,
                nodes: violation.nodes.map((node) => ({
                  target: node.target,
                  summary: node.failureSummary,
                })),
              }))
            : [];
        result.push({
          route,
          viewport: width,
          status: response?.status(),
          ...findings,
          accessibility,
        });
        await writeFile(`${directory}/findings.json`, JSON.stringify(result, null, 2));
      }
    }
    await writeFile(`${directory}/findings.json`, JSON.stringify(result, null, 2));
    createLogger("test.interface-capture").info({
      label,
      screens: routes.length,
      captures: result.length,
      overflow: result.filter((r) => r.overflow).length,
      invalidHeadings: result.filter((r) => r.h1 !== 1).length,
      unnamedControls: result.reduce((sum, r) => sum + r.missingLabels, 0),
    });
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
main().catch((error) => {
  createLogger("test.interface-capture").error(
    { err: error },
    "Interface capture failed."
  );
  process.exitCode = 1;
});
