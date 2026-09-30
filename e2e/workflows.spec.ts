import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import {
  resetBrowserAuthenticationLimit,
  readMailLink,
  signIn,
  fillProfile,
} from "./helpers";

test.beforeAll(resetBrowserAuthenticationLimit);

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
    await page.goto("/requests/new");
    await expect(
      page.getByText("Complete profile consent", { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate drafts" })).toHaveCount(0);
    await page.getByRole("link", { name: "Finish setup", exact: true }).click();
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
    await page.goto("/evidence");
    await page.getByLabel("Kind", { exact: true }).selectOption("BROKER_RESPONSE");
    await page.getByLabel("File", { exact: true }).setInputFiles({
      name: "résumé privé.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("This is not a PDF."),
    });
    await page.getByRole("button", { name: "Store file", exact: true }).click();
    await expect(page.locator("#file-error")).toContainText(
      "contents match its file type"
    );
    await expect(page.getByLabel("Kind", { exact: true })).toHaveValue("BROKER_RESPONSE");
    expect(
      await page
        .getByLabel("File", { exact: true })
        .evaluate((input: HTMLInputElement) => input.files?.length)
    ).toBe(1);
    await page.getByLabel("File", { exact: true }).setInputFiles({
      name: "résumé privé.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\nSynthetic browser evidence\n%%EOF"),
    });
    await page.getByRole("button", { name: "Store file", exact: true }).click();
    await expect(page).toHaveURL(/\/evidence\?stored=1/);
    const fileLink = page.getByRole("link", { name: "Download", exact: true });
    await expect(fileLink).toBeVisible();
    const download = await page.request.get((await fileLink.getAttribute("href"))!);
    expect(download.status()).toBe(200);
    expect(await download.text()).toContain("Synthetic browser evidence");
    expect(download.headers()["content-disposition"]).toContain("filename*=UTF-8''");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "No files stored", exact: true })
    ).toBeVisible();
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.goto("/vault");
    const navigation = page.getByRole("button", { name: "Open navigation" });
    await navigation.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(navigation).toBeFocused();
    const identifiersTab = page.getByRole("tab", { name: "Identifiers", exact: true });
    await identifiersTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Addresses", exact: true })
    ).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(
      page.getByRole("tab", { name: "Export and deletion", exact: true })
    ).toHaveAttribute("aria-selected", "true");
    const deleteProfile = page.getByRole("button", {
      name: "Delete this profile",
      exact: true,
    });
    await deleteProfile.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(deleteProfile).toBeFocused();
    await identifiersTab.click();
    const identifierTable = page.getByRole("region", {
      name: "Profile identifiers",
      exact: true,
    });
    await identifierTable.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => identifierTable.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
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
    await page.goto("/notifications");
    const preference = page.getByLabel(
      "Email me when a new notification needs my attention"
    );
    await expect(preference).not.toBeChecked();
    await preference.check();
    await page.getByRole("button", { name: "Save notification preferences" }).click();
    await expect(
      page.getByText("Email reminders are on for new notifications.", { exact: true })
    ).toBeVisible();
    await page.reload();
    await expect(preference).toBeChecked();
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
      await page.goto("/notifications");
      await expect(
        page.getByRole("heading", { name: "Household invitation accepted" })
      ).toBeVisible();
      await page.getByRole("button", { name: "Mark read", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "You have no unread notifications" })
      ).toBeVisible();
      await page.getByLabel("Show", { exact: true }).selectOption("all");
      await page.getByRole("button", { name: "Apply filter" }).click();
      await page.getByRole("button", { name: "Dismiss", exact: true }).click();
      await page.getByLabel("Show", { exact: true }).selectOption("dismissed");
      await page.getByRole("button", { name: "Apply filter" }).click();
      await page.getByRole("button", { name: "Restore", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "No notifications in this view" })
      ).toBeVisible();
      await preference.uncheck();
      await page.getByRole("button", { name: "Save notification preferences" }).click();
      await expect(
        page.getByText(
          "Email reminders are off. Your in-app notifications remain available.",
          { exact: true }
        )
      ).toBeVisible();
      await page.goto("/household");
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
