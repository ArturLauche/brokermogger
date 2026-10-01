import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { resetEnvCacheForTests } from "@/lib/config/env";
import { readBoundedBody } from "@/lib/http/body";
import { retrieveReceivedEmail, requestReferences } from "@/lib/email/receiving";
import { correspondenceText } from "@/lib/responses/content";
import { suggestClassification } from "@/lib/responses/classify";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEnvCacheForTests();
});

describe("private received correspondence", () => {
  it("converts HTML to text without executing or exposing tracking images", () => {
    const text = correspondenceText({
      text: null,
      html: '<p>Hello &amp; thanks.</p><script>steal()</script><img src="https://tracking.invalid/open"><style>secret{}</style><a href="https://example.org/privacy">Privacy information</a>',
    });
    expect(text).toContain("Hello & thanks.");
    expect(text).toContain("https://example.org/privacy");
    expect(text).not.toMatch(/steal|tracking|secret|<img|<script/);
  });
  it("prefers plaintext and refuses silent truncation", () => {
    expect(
      correspondenceText({ text: "Plain response", html: "<p>Different response</p>" })
    ).toBe("Plain response");
    expect(() => correspondenceText({ text: "a".repeat(100_001), html: null })).toThrow(
      /limit/
    );
  });
  it("only recognises complete high-entropy references", () => {
    const full = `BM-${"A1".repeat(16)}`;
    expect(
      requestReferences(`Re: BM-ABC123; ${full}; quoted ${full.toLowerCase()}`)
    ).toEqual([full]);
    expect(requestReferences(`${full}AA ${full}x BM-123`)).toEqual([]);
    const crowded = Array.from(
      { length: 101 },
      (_, index) => `BM-${index.toString(16).padStart(32, "0")}`
    ).join(" ");
    expect(requestReferences(crowded)).toEqual([]);
  });
  it("keeps ambiguous and negative text out of confident completion suggestions", () => {
    expect(suggestClassification("We have not deleted your data.")).toBe("REJECTED");
    expect(suggestClassification("We have received your request.")).toBe(
      "AUTO_ACKNOWLEDGEMENT"
    );
    expect(suggestClassification("We have deleted your data.")).toBe(
      "CONFIRMED_COMPLETED"
    );
    expect(suggestClassification("We deleted some of your data.")).toBe(
      "PARTIALLY_COMPLETED"
    );
    expect(suggestClassification("This is hard to interpret.")).toBe("UNCLEAR");
  });
  it("bounds streamed bytes even without Content-Length", async () => {
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(new Uint8Array(10));
        controller.enqueue(new Uint8Array(10));
        controller.close();
      },
    });
    await expect(
      readBoundedBody({ body, headers: new Headers() }, 15)
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readBoundedBody(
        new Response("oversized", { headers: { "content-length": "100000" } }),
        15
      )
    ).rejects.toMatchObject({ status: 413 });
  });
  it("retrieves content separately using only the fixed provider URL and CID images", async () => {
    vi.stubEnv("RESEND_RECEIVING_DOMAIN", "replies.example.org");
    vi.stubEnv("RESEND_API_KEY", "test-provider-key");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "test-hook");
    resetEnvCacheForTests();
    const id = randomUUID();
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        id,
        from: "broker@example.org",
        to: ["private@replies.example.org"],
        created_at: new Date().toISOString(),
        subject: "Reply",
        text: null,
        html: "<p>We have received your request.</p>",
        attachments: [],
      })
    );
    vi.stubGlobal("fetch", fetch);
    expect(await retrieveReceivedEmail(id)).toMatchObject({
      available: true,
      body: "We have received your request.",
    });
    expect(fetch).toHaveBeenCalledWith(
      `https://api.resend.com/emails/receiving/${id}?html_format=cid`,
      expect.objectContaining({ redirect: "error", cache: "no-store" })
    );
    await expect(retrieveReceivedEmail("../other-host")).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
