import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { test, expect } from "./fixtures";
import { resetBrowserAuthenticationLimit } from "./helpers";

test.beforeEach(resetBrowserAuthenticationLimit);
test.afterEach(resetBrowserAuthenticationLimit);

test("form and direct Auth.js access share quotas without exposing throttled addresses", async ({
  page,
}) => {
  const db = new PrismaClient();
  try {
    const emailsBefore = await db.outboundEmail.count({
      where: { purpose: "MAGIC_LINK" },
    });
    const tokensBefore = await db.verificationToken.count();
    const email = `auth-journey-${randomUUID()}@example.org`;
    for (let index = 0; index < 3; index++) {
      await page.goto("/login");
      await page.getByLabel("Your email address").fill(email);
      await page.getByRole("button", { name: "Send me a sign in link" }).click();
      await expect(page).toHaveURL(/\/login\/check-email/);
    }
    const csrf = await page.request.get("/api/auth/csrf");
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    const targets: string[] = [];
    for (let index = 0; index < 13; index++) {
      const response = await page.request.post("/api/auth/signin/magic-link", {
        maxRedirects: 0,
        headers: {
          "x-forwarded-for": `192.0.2.${index + 1}`,
          "x-real-ip": `192.0.2.${index + 1}`,
        },
        form: {
          email: index === 0 ? email : `auth-rotate-${randomUUID()}@example.org`,
          csrfToken,
          callbackUrl: "/dashboard",
        },
      });
      expect(response.status()).toBe(302);
      targets.push(response.headers()["location"]!);
    }
    expect(new Set(targets).size).toBe(1);
    // The fourth attempt at the original email is rejected but also consumes
    // one network attempt, leaving six additional sends after the three form links.
    expect(await db.outboundEmail.count({ where: { purpose: "MAGIC_LINK" } })).toBe(
      emailsBefore + 9
    );
    expect(await db.verificationToken.count()).toBe(tokensBefore + 9);
    const network = await db.rateLimitBucket.findFirstOrThrow({
      where: { scope: "auth.magic_link.ip" },
    });
    expect(network.count).toBe(16);
  } finally {
    await db.$disconnect();
  }
});
