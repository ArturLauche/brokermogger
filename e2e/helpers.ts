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
