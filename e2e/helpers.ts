import { PrismaClient } from "./db";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

const mailDirectory = resolve(process.env.MOCK_EMAIL_DIR ?? ".tmp/e2e-mail");

export async function readMailLink(email: string, path: string) {
  let link = "";
  await expect
    .poll(
      async () => {
        const files = await readdir(mailDirectory).catch(() => []);
        for (const filename of files.sort().reverse()) {
          const text = await readFile(resolve(mailDirectory, filename), "utf8");
          if (!text.includes(`To: ${email}\n`)) continue;
          link =
            text
              .split("\n")
              .find((line) => line.startsWith("http") && line.includes(path)) ?? "";
          if (link) break;
        }
        return Boolean(link);
      },
      {
        message: "A local simulated email should contain the requested link",
        timeout: 20_000,
      }
    )
    .toBe(true);
  return link;
}

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Your email address").fill(email);
  await page.getByRole("button", { name: "Send me a sign in link" }).click();
  await expect(page).toHaveURL(/\/login\/check-email/);
  await page.goto(await readMailLink(email, "/api/auth/callback/"));
  await expect(page).toHaveURL(/\/(onboarding|dashboard)/);
}

export async function fillProfile(page: Page, email: string, name: string) {
  await page.getByLabel("Profile label").fill("Personal profile");
  await page.getByLabel("Full legal name").fill(name);
  await page.getByLabel("Profile contact email").fill(email);
  await page.getByLabel("Country of residence").selectOption("US");
  await page.getByLabel("State or District of Columbia").selectOption("CA");
  await page
    .getByLabel("This person lives in the selected country and state or region.")
    .check();
}

export function assertIsolatedBrowserEnvironment() {
  const message =
    "Browser fixtures require a local server, a dedicated test database and disabled external sending.";
  let local: URL;
  let database: URL;
  try {
    if (!process.env.DATABASE_URL) throw new Error(message);
    local = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000");
    database = new URL(process.env.DATABASE_URL);
  } catch {
    // URL's native error includes its input, which can contain credentials.
    throw new Error(message);
  }
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(local.hostname) ||
    !database.pathname.endsWith("_test") ||
    process.env.EMAIL_PROVIDER !== "mock" ||
    process.env.ALLOW_EXTERNAL_SENDING !== "false"
  )
    throw new Error(message);
}

/** Explicitly advance only a synthetic target before driving a leased worker. */
export async function makeBrowserJobDue(db: PrismaClient, jobId: string) {
  assertIsolatedBrowserEnvironment();
  const updated = await db.$executeRaw`
    UPDATE "BackgroundJob"
    SET "priority" = 0, "runAt" = NOW() - INTERVAL '1 minute', "updatedAt" = NOW()
    WHERE "id" = ${jobId} AND "status" IN ('PENDING', 'RETRYABLE')
  `;
  expect(updated).toBe(1);
}

/** Keep repeated local QA runs independent without weakening application limits. */
export async function resetBrowserAuthenticationLimit() {
  assertIsolatedBrowserEnvironment();
  const db = new PrismaClient();
  try {
    await db.rateLimitBucket.deleteMany({ where: { scope: "auth.magic_link.ip" } });
  } finally {
    await db.$disconnect();
  }
}
