import { describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
import {
  clientIpFromHeaders,
  requestContextFromHeaders,
} from "@/lib/auth/requestContext";

describe("trusted proxy IP boundary", () => {
  it("ignores forwarding headers by default", () => {
    const headers = new Headers({
      "x-forwarded-for": "192.0.2.1",
      "x-real-ip": "192.0.2.2",
    });
    expect(clientIpFromHeaders(headers)).toBeNull();
    expect(requestContextFromHeaders(headers).ipHash).toBeNull();
  });
  it("uses only the explicitly selected header", () => {
    const headers = new Headers({
      "x-real-ip": "192.0.2.1",
      "x-forwarded-for": "192.0.2.2",
    });
    expect(clientIpFromHeaders(headers, "x-real-ip")).toBe("192.0.2.1");
    expect(clientIpFromHeaders(headers, "x-forwarded-for")).toBe("192.0.2.2");
    expect(
      clientIpFromHeaders(new Headers({ "x-real-ip": "192.0.2.1" }), "x-forwarded-for")
    ).toBeNull();
  });
  it.each([
    "192.0.2.1, 192.0.2.2",
    "arbitrary-network",
    "192.0.2.1:80",
    "",
    "[::1]",
    "::1%eth0",
  ])("rejects invalid or ambiguous values: %s", (value) => {
    expect(
      clientIpFromHeaders(new Headers({ "x-forwarded-for": value }), "x-forwarded-for")
    ).toBeNull();
  });
  it("canonicalises equivalent IPv6 forms", () => {
    const a = new Headers({ "x-real-ip": "2001:db8::1" });
    const b = new Headers({ "x-real-ip": "2001:0DB8:0000:0000:0000:0000:0000:0001" });
    expect(clientIpFromHeaders(a, "x-real-ip")).toBe(clientIpFromHeaders(b, "x-real-ip"));
  });
});
