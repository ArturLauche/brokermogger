import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "../../../proxy";

describe("public household consent", () => {
  it("lets an invited adult open a consent link without an account", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/household/consent/token")
    );
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("Content-Security-Policy")).toContain("strict-dynamic");
  });

  it("continues redirecting the private household workspace to login", () => {
    const response = proxy(new NextRequest("http://localhost:3000/household"));
    expect(response.headers.get("location")).toContain("/login?next=");
  });
});
