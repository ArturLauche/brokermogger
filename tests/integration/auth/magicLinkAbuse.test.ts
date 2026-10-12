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
import {
  anonymousAuditActor,
  recordAuditOrThrow,
  verifyAuditChain,
} from "@/lib/audit/service";
import { authorizeMagicLinkRequest } from "@/lib/auth/magicLinkRateLimit";
import { withMagicLinkContext } from "@/lib/auth/magicLinkContext";
import { sendMagicLinkVerificationRequest } from "@/lib/auth/magicLink";
import { authConfig } from "@/lib/auth/config";
import * as bucketRepository from "@/lib/db/repositories/rateLimit";
import * as auditRepository from "@/lib/db/repositories/audit";
import { getEmailProvider } from "@/lib/email";
import type { EmailConfig } from "@auth/core/providers/email";
import { env } from "@/lib/config/env";

// Verify the configured canonical, independently of a framework/request host.
// CI uses the numeric loopback address; local fixtures commonly use localhost.
const origin = new URL(env.APP_BASE_URL).origin;
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
  spoof = "192.0.2.1",
  json = false
) {
  return POST(
    new Request(`${origin}/api/auth/signin/magic-link`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: token.cookie,
        "x-forwarded-for": spoof,
        "x-real-ip": spoof,
        ...(json ? { "X-Auth-Return-Redirect": "1" } : {}),
      },
      body: new URLSearchParams({
        email,
        csrfToken: token.csrfToken,
        callbackUrl: "/dashboard",
      }),
    }) as NextRequest
  );
}

// Exercise failures in the real database, including a trigger silently skipping
// an INSERT. No domain/repository mocks can accidentally hide an inner commit.
async function withAdmissionWriteFailure(
  target: "audit" | "email" | "network",
  failure: "reject" | "suppress",
  run: () => Promise<void>
) {
  const table = target === "audit" ? "AuditLog" : "RateLimitBucket";
  const condition =
    target === "audit"
      ? "NEW.action IN ('auth.magic_link.requested', 'auth.magic_link.rate_limited')"
      : `NEW.scope = '${target === "email" ? magicLinkPerEmail.scope : magicLinkPerIp.scope}'`;
  const statement =
    failure === "suppress"
      ? "RETURN NULL;"
      : "RAISE EXCEPTION 'synthetic admission write failure';";
  await testPrisma.$executeRawUnsafe(
    `CREATE FUNCTION synthetic_admission_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN ${statement} END IF; RETURN NEW; END $$`
  );
  try {
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER synthetic_admission_failure BEFORE INSERT OR UPDATE ON "${table}" FOR EACH ROW EXECUTE FUNCTION synthetic_admission_failure()`
    );
    try {
      await run();
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER synthetic_admission_failure ON "${table}"`
      );
    }
  } finally {
    await testPrisma.$executeRawUnsafe(`DROP FUNCTION synthetic_admission_failure()`);
  }
}

it.each(["reject", "suppress"] as const)(
  "rolls back quota and prevents tokens/email when audit insertion %s fails",
  async (failure) => {
    const token = await csrf();
    await createAuthAdapter().createUser!({
      id: "unused",
      email: "synthetic-known@example.org",
      emailVerified: null,
      role: "USER",
      status: "ACTIVE",
    });
    await withAdmissionWriteFailure("audit", failure, async () => {
      for (const email of ["synthetic-known@example.org", "synthetic-new@example.org"]) {
        const response = await requestLink(email, token);
        expect(response.headers.get("location")).toBe(
          `${origin}/api/auth/verify-request?provider=magic-link&type=email`
        );
        const json = await requestLink(email, token, "192.0.2.1", true);
        expect(await json.json()).toEqual({
          url: `${origin}/api/auth/verify-request?provider=magic-link&type=email`,
        });
        const form = new FormData();
        form.set("email", email);
        await expect(requestMagicLink(form)).rejects.toThrow(
          "redirect:/login/check-email"
        );
      }
      expect(await testPrisma.rateLimitBucket.count()).toBe(0);
      expect(await testPrisma.auditLog.count()).toBe(0);
      expect(await testPrisma.verificationToken.count()).toBe(0);
      expect(await testPrisma.outboundEmail.count()).toBe(0);
    });
    // A new HTTP request may retry after recovery; the failed attempt charged
    // nothing, and successful admission has one counter pair and one proof.
    await requestLink("synthetic-new@example.org", token);
    const buckets = await testPrisma.rateLimitBucket.findMany();
    expect(buckets).toHaveLength(2);
    expect(buckets.every((bucket) => bucket.count === 1)).toBe(true);
    expect(await testPrisma.auditLog.count()).toBe(1);
    expect(await testPrisma.verificationToken.count()).toBe(1);
    expect(await testPrisma.outboundEmail.count()).toBe(1);
    expect((await verifyAuditChain()).valid).toBe(true);
  }
);

it.each([
  ["email", "reject"],
  ["email", "suppress"],
  ["network", "reject"],
  ["network", "suppress"],
] as const)(
  "rolls back admission when the %s counter %s fails",
  async (target, failure) => {
    const token = await csrf();
    await withAdmissionWriteFailure(target, failure, async () => {
      const response = await requestLink("synthetic-counter@example.org", token);
      expect(response.headers.get("location")).toBe(
        `${origin}/api/auth/verify-request?provider=magic-link&type=email`
      );
      expect(await testPrisma.rateLimitBucket.count()).toBe(0);
      expect(await testPrisma.auditLog.count()).toBe(0);
      expect(await testPrisma.verificationToken.count()).toBe(0);
      expect(await testPrisma.outboundEmail.count()).toBe(0);
      expect((await verifyAuditChain()).valid).toBe(true);
    });
  }
);

it("rolls back a denied attempt without changing existing counters or proofs", async () => {
  const token = await csrf();
  const email = "synthetic-limit@example.org";
  for (let index = 0; index < magicLinkPerEmail.limit; index++)
    await requestLink(email, token);
  const before = await testPrisma.rateLimitBucket.findMany({ orderBy: { scope: "asc" } });
  await withAdmissionWriteFailure("audit", "reject", async () => {
    await requestLink(email, token);
    expect(
      await testPrisma.rateLimitBucket.findMany({ orderBy: { scope: "asc" } })
    ).toEqual(before);
    expect(await testPrisma.auditLog.count()).toBe(magicLinkPerEmail.limit);
    expect(await testPrisma.verificationToken.count()).toBe(magicLinkPerEmail.limit);
    expect(await testPrisma.outboundEmail.count()).toBe(magicLinkPerEmail.limit);
  });
  await requestLink(email, token);
  expect(
    await testPrisma.auditLog.count({ where: { action: "auth.magic_link.rate_limited" } })
  ).toBe(1);
  expect((await verifyAuditChain()).valid).toBe(true);
});

it("rolls back real counters when the audit appender silently returns null", async () => {
  const token = await csrf();
  const append = vi
    .spyOn(auditRepository, "appendAuditLogInTransaction")
    .mockResolvedValueOnce(null as never);
  const send = vi.spyOn(getEmailProvider(), "sendMagicLinkEmail");
  try {
    const response = await requestLink("synthetic-null-proof@example.org", token);
    expect(response.headers.get("location")).toBe(
      `${origin}/api/auth/verify-request?provider=magic-link&type=email`
    );
    expect(append).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(await testPrisma.rateLimitBucket.count()).toBe(0);
    expect(await testPrisma.auditLog.count()).toBe(0);
    expect(await testPrisma.verificationToken.count()).toBe(0);
    expect(await testPrisma.outboundEmail.count()).toBe(0);
  } finally {
    append.mockRestore();
    send.mockRestore();
  }
});

it.each([false, true])(
  "single-flights concurrent callback/provider checks when audit failure is %s",
  async (failed) => {
    const email = "synthetic-single-flight@example.org";
    const increment = vi.spyOn(bucketRepository, "incrementBuckets");
    const send = vi.spyOn(getEmailProvider(), "sendMagicLinkEmail");
    const signIn = authConfig.callbacks!.signIn!;
    const run = async () => {
      await withMagicLinkContext(
        {
          requestId: "synthetic-single-flight",
          ipHash: null,
          userAgentHash: null,
          entryPoint: "auth_api",
        },
        async () => {
          const results = await Promise.allSettled([
            signIn({
              user: { id: "synthetic", email, role: "USER", status: "ACTIVE" },
              account: {
                provider: "magic-link",
                type: "email",
                providerAccountId: email,
              },
              email: { verificationRequest: true },
            }),
            authorizeMagicLinkRequest(email),
            sendMagicLinkVerificationRequest({
              identifier: email,
              url: `${origin}/api/auth/callback/magic-link?token=synthetic`,
              expires: new Date(Date.now() + 60_000),
              request: new Request(`${origin}/api/auth/signin/magic-link`),
              provider: authConfig.providers[0] as EmailConfig,
              theme: {},
              token: "synthetic",
            }),
          ]);
          expect(results[0]).toEqual({
            status: "fulfilled",
            value: failed
              ? `${origin}/api/auth/verify-request?provider=magic-link&type=email`
              : true,
          });
          expect(results[1]!.status).toBe(failed ? "rejected" : "fulfilled");
          expect(results[2]!.status).toBe(failed ? "rejected" : "fulfilled");
          if (failed) {
            await expect(authorizeMagicLinkRequest(email)).rejects.toThrow();
          } else {
            await expect(authorizeMagicLinkRequest(email)).resolves.toBe(true);
          }
        }
      );
      expect(increment).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(failed ? 0 : 1);
      const buckets = await testPrisma.rateLimitBucket.findMany();
      expect(buckets).toHaveLength(failed ? 0 : 2);
      expect(buckets.every((bucket) => bucket.count === 1)).toBe(true);
      expect(await testPrisma.auditLog.count()).toBe(failed ? 0 : 1);
      expect(await testPrisma.outboundEmail.count()).toBe(failed ? 0 : 1);
      expect(await testPrisma.verificationToken.count()).toBe(0);
      expect((await verifyAuditChain()).valid).toBe(true);
    };
    try {
      if (failed) await withAdmissionWriteFailure("audit", "reject", run);
      else await run();
    } finally {
      increment.mockRestore();
      send.mockRestore();
    }
  }
);

it("preserves one audit chain under simultaneous admission and unrelated audit writers", async () => {
  const token = await csrf();
  await Promise.all([
    ...Array.from({ length: 20 }, (_, index) =>
      requestLink(`synthetic-mixed-${index}@example.org`, token)
    ),
    ...Array.from({ length: 8 }, (_, index) =>
      recordAuditOrThrow({
        actor: anonymousAuditActor(`synthetic-other-${index}`),
        action: "auth.sign_out",
        resourceType: "session",
      })
    ),
  ]);
  expect(await testPrisma.auditLog.count()).toBe(28);
  expect(await testPrisma.verificationToken.count()).toBe(magicLinkPerIp.limit);
  expect(await testPrisma.outboundEmail.count()).toBe(magicLinkPerIp.limit);
  const network = await testPrisma.rateLimitBucket.findMany({
    where: { scope: magicLinkPerIp.scope },
  });
  expect(network).toHaveLength(1);
  expect(network[0]!.count).toBe(20);
  expect((await verifyAuditChain()).valid).toBe(true);
});

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
