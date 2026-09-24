import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { readMailLink, signIn, fillProfile } from "./helpers";

test.describe("profile and household workflows", () => {
  test.beforeEach(async ({ baseURL }) => {
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL!).hostname);
  });

  test("signs in, resumes onboarding, edits the vault and signs out", async ({
    page,
  }) => {
    const email = `profile-${randomUUID()}@example.org`;
    await signIn(page, email);
    await page.goto("/onboarding");
    await fillProfile(page, email, "Alex Browser");
    await page.getByLabel("Other email addresses").fill(`extra-${email}`);
    await page.getByRole("button", { name: "Save and finish later" }).click();
    await expect(page.getByRole("status")).toContainText("Your profile is saved");
    await page.reload();
    await expect(page.getByLabel("Full legal name")).toHaveValue("Alex Browser");
    await page.getByRole("button", { name: "Finish setup" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/vault");
    await page.getByRole("link", { name: "Edit profile", exact: true }).click();
    await page.getByLabel("Full legal name").fill("Alex Edited");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page).toHaveURL(/\/vault\?saved=profile/);
    const extra = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "No", exact: true }) })
      .first();
    await extra.getByRole("link", { name: "Edit", exact: true }).click();
    await page.getByLabel("Value", { exact: true }).fill(`changed-${email}`);
    await page.getByRole("button", { name: "Save identifier" }).click();
    await expect(page).toHaveURL(/\/vault\?saved=identifier/);
    await page.goto("/settings/account");
    await page.getByLabel("Timezone", { exact: true }).fill("Not/AZone");
    await page.getByRole("button", { name: "Save account" }).click();
    await expect(page.getByText(/Enter a valid timezone/)).toBeVisible();
    await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue("Not/AZone");
    await page.getByLabel("Timezone", { exact: true }).fill("America/New_York");
    await page.getByRole("button", { name: "Save account" }).click();
    await expect(page).toHaveURL(/saved=1/);
    await page.getByRole("button", { name: /^Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/vault");
    await expect(page).toHaveURL(/\/login/);
  });

  test("lets an invited adult accept without an account and withdraw later", async ({
    page,
    browser,
  }) => {
    const email = `household-${randomUUID()}@example.org`;
    const invitedEmail = `adult-${randomUUID()}@example.org`;
    await signIn(page, email);
    await page.goto("/household");
    await fillProfile(page, invitedEmail, "Morgan Browser");
    await page.getByLabel(/I confirm this person is an adult/).check();
    await page.getByRole("button", { name: "Save profile and send invitation" }).click();
    await expect(page.getByRole("status")).toContainText("Email delivery is simulated");
    const link = await readMailLink(invitedEmail, "/household/consent/");
    const context = await browser.newContext();
    try {
      const adult = await context.newPage();
      await adult.goto(link);
      await expect(
        adult.getByRole("heading", { name: "Household privacy requests" })
      ).toBeVisible();
      await adult.getByLabel("I am an adult and this invitation is for me.").check();
      await adult
        .getByLabel("The displayed country and state or region are where I live.")
        .check();
      await adult.getByRole("button", { name: "I agree", exact: true }).click();
      await expect(
        adult.getByRole("heading", { name: "Permission granted" })
      ).toBeVisible();
      await page.reload();
      await expect(page.getByText("Permission granted", { exact: true })).toBeVisible();
      await adult.getByRole("button", { name: "Withdraw my permission" }).click();
      await expect(
        adult.getByRole("heading", { name: "Permission withdrawn" })
      ).toBeVisible();
      await page.reload();
      await expect(page.getByText("Permission withdrawn", { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
