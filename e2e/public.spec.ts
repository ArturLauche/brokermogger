import { resetBrowserAuthenticationLimit } from "./helpers";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { PUBLIC_FAQ_ITEMS } from "@/lib/content/faq";

test.beforeAll(resetBrowserAuthenticationLimit);

test.describe("public screens", () => {
  test("FAQ answers remain available without JavaScript", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(`${baseURL}/#faq`);
      const item = PUBLIC_FAQ_ITEMS[0]!;
      await expect(page.getByText(item.answer, { exact: true })).toBeHidden();
      await page.locator("summary").filter({ hasText: item.question }).click();
      await expect(page.getByText(item.answer, { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });
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

  test("missing routes return a private 404 with runtime metadata and fresh script nonces", async ({
    page,
    baseURL,
  }) => {
    let previousNonce: string | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await page.goto("/this-page-does-not-exist");
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "This page does not exist"
      );
      expect(await page.locator("html").getAttribute("lang")).toBe("en");
      expect(
        await page.locator('meta[name="robots"]').first().getAttribute("content")
      ).toContain("noindex");
      const nonce = (await response!.headerValue("content-security-policy"))?.match(
        /'nonce-([^']+)'/
      )?.[1];
      expect(nonce).toBeTruthy();
      expect(nonce).not.toBe(previousNonce);
      previousNonce = nonce;
      expect(
        await page
          .locator("script")
          .evaluateAll((scripts) =>
            scripts.every((script) => Boolean(script.nonce?.length))
          )
      ).toBe(true);
      const image = await page
        .locator('meta[property="og:image"]')
        .first()
        .getAttribute("content");
      expect(image && new URL(image).origin).toBe(new URL(baseURL!).origin);
      await page.getByRole("link", { name: "Go to the start page" }).click();
      await expect(page).toHaveURL(`${baseURL}/`);
    }
    const sitemap = await page.request.get("/sitemap.xml");
    expect(await sitemap.text()).not.toContain("<lastmod>");
  });
});
