import { describe, expect, it } from "vitest";

import { Webhook } from "svix";

/**
 * Locks the exact `svix` API contract the Resend route depends on:
 * `new Webhook(secret).verify(rawBody, { "svix-id", "svix-timestamp", "svix-signature" })`.
 *
 * svix 2.0.0/2.1.0 shipped a broken verify signature and are deprecated; this
 * test fails if a future upgrade changes the call shape again.
 */
const SECRET = `whsec_${Buffer.from("brokermogger-webhook-test-secret!").toString("base64")}`;
const PAYLOAD = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });

function signedHeaders(webhook: Webhook, payload: string) {
  const id = "msg_test_1";
  const timestamp = new Date();
  return {
    "svix-id": id,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1_000)),
    "svix-signature": webhook.sign(id, timestamp, payload),
  };
}

describe("Resend webhook signature contract (svix)", () => {
  it("verifies a genuine delivery event", () => {
    const webhook = new Webhook(SECRET);
    // This svix version signals success by not throwing; it does not return
    // the parsed payload (the route re-parses the raw body itself).
    expect(() => webhook.verify(PAYLOAD, signedHeaders(webhook, PAYLOAD))).not.toThrow();
  });

  it("rejects a tampered payload with a valid signature", () => {
    const webhook = new Webhook(SECRET);
    const headers = signedHeaders(webhook, PAYLOAD);
    const tampered = PAYLOAD.replace("email.delivered", "email.bounced");
    expect(() => webhook.verify(tampered, headers)).toThrow();
  });

  it("rejects a signature from a different secret", () => {
    const attacker = new Webhook(
      `whsec_${Buffer.from("different-webhook-secret-value!!!").toString("base64")}`
    );
    expect(() =>
      new Webhook(SECRET).verify(PAYLOAD, signedHeaders(attacker, PAYLOAD))
    ).toThrow();
  });

  it("rejects missing signature headers", () => {
    expect(() => new Webhook(SECRET).verify(PAYLOAD, {})).toThrow();
  });
});
