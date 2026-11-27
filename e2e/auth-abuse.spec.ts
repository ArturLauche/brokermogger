import { randomUUID } from "node:crypto";
import { PrismaClient } from "./db";
import { test, expect } from "./fixtures";
import { resetBrowserAuthenticationLimit } from "./helpers";
import { env } from "../lib/config/env";

test.beforeEach(resetBrowserAuthenticationLimit);
test.afterEach(resetBrowserAuthenticationLimit);

test("form and direct Auth.js access share quotas without exposing throttled addresses", async ({
  page,
}) => {
  const db = new PrismaClient();
  try {
    // These forged headers deliberately exercise the default untrusted boundary.
    expect(env.TRUSTED_PROXY_IP_HEADER).toBe("none");
    const emailsBefore = await db.outboundEmail.count({
      where: { purpose: "MAGIC_LINK" },
    });
    const tokensBefore = await db.verificationToken.count();
    const proofBoundary = await db.auditLog.aggregate({ _max: { sequence: true } });
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
    const admitted = await db.auditLog.count({
      where: {
        sequence: { gt: proofBoundary._max.sequence ?? 0n },
        action: "auth.magic_link.requested",
      },
    });
    expect(await db.outboundEmail.count({ where: { purpose: "MAGIC_LINK" } })).toBe(
      emailsBefore + admitted
    );
    expect(await db.verificationToken.count()).toBe(tokensBefore + admitted);
    const network = await db.rateLimitBucket.aggregate({
      where: { scope: "auth.magic_link.ip" },
      _sum: { count: true },
      _count: { id: true },
    });
    // Every fixed window created during the journey counts, including rollover.
    expect(network._sum.count).toBe(16);
    expect(admitted).toBeGreaterThanOrEqual(3);
    expect(admitted).toBeLessThanOrEqual(network._count.id * 10);
  } finally {
    await db.$disconnect();
  }
});
