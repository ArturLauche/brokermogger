import { describe, expect, it } from "vitest";
import { optionalPublicUrlSchema, publicUrlSchema } from "@/lib/validation/publicUrl";

describe("public link validation", () => {
  it("accepts omitted optional links without throwing inside the URL refinement", () => {
    expect(optionalPublicUrlSchema.safeParse("").success).toBe(true);
    expect(publicUrlSchema.safeParse("").success).toBe(false);
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,<h1>hello</h1>",
    "https://user:secret@example.org",
    "not a url",
  ])("rejects %s with a validation result", (value) => {
    expect(publicUrlSchema.safeParse(value).success).toBe(false);
    expect(optionalPublicUrlSchema.safeParse(value).success).toBe(false);
  });
  it("accepts ordinary source links", () => {
    expect(publicUrlSchema.safeParse("https://example.org/privacy#rights").success).toBe(
      true
    );
  });
});
