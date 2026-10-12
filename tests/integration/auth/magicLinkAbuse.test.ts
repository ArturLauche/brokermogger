import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { skipCSRFCheck as CoreSkipCSRFCheck } from "@auth/core";

// Run the real Auth.js HTTP/CSRF/token pipeline. Only the Next.js framework
// adapter is replaced because its extensionless ESM imports need Next's bundler.
vi.mock("next-auth", async () => {
  const { Auth, skipCSRFCheck } = await import("@auth/core");
  return {
    default: (config: Parameters<typeof Auth>[1]) => ({
      handlers: {
        GET: (request: Request) => Auth(request, { ...config, basePath: "/api/auth" }),
        POST: (request: Request) => Auth(request, { ...config, basePath: "/api/auth" }),
      },
      signIn: (_provider: string, options: { email: string }) =>
        Auth(
          new Request("http://localhost:3000/api/auth/signin/magic-link", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              email: options.email,
              callbackUrl: "/dashboard",
            }),
          }),
          {
            ...config,
            basePath: "/api/auth",
            skipCSRFCheck: skipCSRFCheck as typeof CoreSkipCSRFCheck,
          }
        ),
    }),
  };
});

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "synthetic-auth-test" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import { GET, POST } from "@/app/api/auth/[...nextauth]/route";
import { magicLinkPerEmail, magicLinkPerIp } from "@/lib/rateLimit";
import { testPrisma } from "../../helpers/db";
import { requestMagicLink } from "@/app/login/actions";
import { createAuthAdapter } from "@/lib/db/repositories/authAdapter";

const origin = "http://localhost:3000";
async function csrf() {
  const response = await GET(new Request(`${origin}/api/auth/csrf`) as NextRequest);
  const { csrfToken } = (await response.json()) as { csrfToken: string };
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { csrfToken, cookie };
}
async function requestLink(
  email: string,
  token: Awaited<ReturnType<typeof csrf>>,
  spoof = "192.0.2.1"
) {
  return POST(
    new Request(`${origin}/api/auth/signin/magic-link`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: token.cookie,
        "x-forwarded-for": spoof,
        "x-real-ip": spoof,
      },
      body: new URLSearchParams({
        email,
        csrfToken: token.csrfToken,
        callbackUrl: "/dashboard",
      }),
    }) as NextRequest
  );
}

describe("direct Auth.js magic link abuse prevention", () => {
  it("shares the network budget across different email addresses and ignores spoofed headers", async () => {
    const token = await csrf();
    const destinations: (string | null)[] = [];
    for (let index = 0; index < magicLinkPerIp.limit + 2; index++) {
      const response = await requestLink(
        `synthetic-${index}@example.org`,
        token,
        `192.0.2.${index + 1}`
      );
      expect(response.status).toBe(302);
      destinations.push(response.headers.get("location"));
    }
    expect(new Set(destinations).size).toBe(1);
    expect(
      await testPrisma.outboundEmail.count({ where: { purpose: "MAGIC_LINK" } })
    ).toBe(magicLinkPerIp.limit);
    expect(await testPrisma.verificationToken.count()).toBe(magicLinkPerIp.limit);
  });

  it("enforces the email quota under concurrent direct calls without creating denied tokens", async () => {
    const token = await csrf();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        requestLink("synthetic-concurrent@example.org", token)
      )
    );
    expect(responses.every((response) => response.status === 302)).toBe(true);
    expect(
      new Set(responses.map((response) => response.headers.get("location"))).size
    ).toBe(1);
    expect(
      await testPrisma.outboundEmail.count({ where: { purpose: "MAGIC_LINK" } })
    ).toBe(magicLinkPerEmail.limit);
    expect(await testPrisma.verificationToken.count()).toBe(magicLinkPerEmail.limit);
  });
});

it("keeps CSRF validation before authentication quota consumption", async () => {
  const response = await requestLink("synthetic-csrf@example.org", {
    csrfToken: "invalid",
    cookie: "",
  });
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toContain("MissingCSRF");
  expect(await testPrisma.rateLimitBucket.count()).toBe(0);
  expect(await testPrisma.verificationToken.count()).toBe(0);
  expect(await testPrisma.outboundEmail.count()).toBe(0);
});

it("caps concurrent requests with different addresses at the network quota", async () => {
  const token = await csrf();
  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      requestLink(`burst-${index}@example.org`, token)
    )
  );
  expect(await testPrisma.outboundEmail.count({ where: { purpose: "MAGIC_LINK" } })).toBe(
    magicLinkPerIp.limit
  );
  expect(await testPrisma.verificationToken.count()).toBe(magicLinkPerIp.limit);
  expect(
    await testPrisma.auditLog.count({ where: { action: "auth.magic_link.rate_limited" } })
  ).toBe(10);
});

it("counts form requests once and shares their quotas with the direct endpoint", async () => {
  const email = "synthetic-form@example.org";
  const form = new FormData();
  form.set("email", email);
  for (let index = 0; index < 3; index++) {
    await expect(requestMagicLink(form)).rejects.toThrow("redirect:/login/check-email");
  }
  const response = await requestLink(email, await csrf());
  expect(response.headers.get("location")).toBe(
    `${origin}/api/auth/verify-request?provider=magic-link&type=email`
  );
  expect(await testPrisma.outboundEmail.count()).toBe(3);
  expect(await testPrisma.verificationToken.count()).toBe(3);
  const buckets = await testPrisma.rateLimitBucket.findMany();
  expect(buckets).toHaveLength(2);
  expect(buckets.every((bucket) => bucket.count === 4)).toBe(true);
  expect(
    await testPrisma.auditLog.count({ where: { action: "auth.magic_link.requested" } })
  ).toBe(3);
});

it("returns the same direct response for known, unknown and email-limited addresses", async () => {
  await createAuthAdapter().createUser!({
    id: "unused",
    email: "synthetic-known@example.org",
    emailVerified: null,
    role: "USER",
    status: "ACTIVE",
  });
  const token = await csrf();
  const locations: (string | null)[] = [];
  for (const email of ["synthetic-known@example.org", "synthetic-new@example.org"]) {
    for (let index = 0; index < 4; index++)
      locations.push((await requestLink(email, token)).headers.get("location"));
  }
  expect(new Set(locations)).toEqual(
    new Set([`${origin}/api/auth/verify-request?provider=magic-link&type=email`])
  );
  expect(await testPrisma.outboundEmail.count()).toBe(6);
  expect(await testPrisma.verificationToken.count()).toBe(6);
});

it("sends the token to the configured instance origin even with an untrusted request host", async () => {
  const { getEmailProvider } = await import("@/lib/email");
  const send = vi.spyOn(getEmailProvider(), "sendMagicLinkEmail");
  try {
    const token = await csrf();
    const response = await POST(
      new Request("http://untrusted.example.invalid:4000/api/auth/signin/magic-link", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: token.cookie,
        },
        body: new URLSearchParams({
          email: "synthetic-origin@example.org",
          csrfToken: token.csrfToken,
          callbackUrl: "/dashboard",
        }),
      }) as NextRequest
    );
    expect(response.status).toBe(302);
    expect(send).toHaveBeenCalledTimes(1);
    const link = new URL(send.mock.calls[0]![0].url);
    expect(link.origin).toBe(origin);
    expect(link.pathname).toBe("/api/auth/callback/magic-link");
    expect(link.searchParams.get("email")).toBe("synthetic-origin@example.org");
    expect(link.searchParams.get("token")).toBeTruthy();
  } finally {
    send.mockRestore();
  }
});

it("normalizes JSON verification replies for allowed and denied requests", async () => {
  const token = await csrf();
  for (let index = 0; index < 4; index++) {
    const response = await POST(
      new Request("http://untrusted.example.invalid:4000/api/auth/signin/magic-link", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: token.cookie,
          "X-Auth-Return-Redirect": "1",
        },
        body: new URLSearchParams({
          email: "synthetic-json@example.org",
          csrfToken: token.csrfToken,
          callbackUrl: "/dashboard",
        }),
      }) as NextRequest
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: `${origin}/api/auth/verify-request?provider=magic-link&type=email`,
    });
  }
  expect(await testPrisma.verificationToken.count()).toBe(3);
  expect(await testPrisma.outboundEmail.count()).toBe(3);
});
