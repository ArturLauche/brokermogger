import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("public screens", () => {
  test("landing explains the product without a paywall", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/not a law firm/i).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /create an account/i }).first()
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("sign in form is labelled and does not enumerate accounts", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /sign in to brokermogger/i })
    ).toBeVisible();
    await page.getByLabel(/your email address/i).fill("unknown@example.org");
    await page.getByRole("button", { name: /send me a sign in link/i }).click();
    await expect(page).toHaveURL(/\/login\/check-email/);
    await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();
  });
});
