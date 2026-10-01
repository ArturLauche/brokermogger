import { describe, expect, it } from "vitest";
import { preferredContact, selectRequestDelivery } from "@/lib/brokers/sendable";

describe("current broker contact selection", () => {
  it("excludes archived contacts and respects verification, preference and priority", () => {
    const contact = (id: string, overrides = {}) => ({
      id,
      type: "EMAIL" as const,
      value: `${id}@example.org`,
      isActive: true,
      isVerified: true,
      isPreferred: false,
      priority: 100,
      deletedAt: null,
      ...overrides,
    });
    const methods = [
      contact("archived", { deletedAt: new Date(), isPreferred: true }),
      contact("unverified", { isVerified: false, isPreferred: true }),
      contact("ordinary"),
      contact("preferred-slow", { isPreferred: true, priority: 20 }),
      contact("preferred-fast", { isPreferred: true, priority: 10 }),
    ];
    expect(preferredContact({ contactMethods: methods })?.value).toBe(
      "preferred-fast@example.org"
    );
    expect(preferredContact({ contactMethods: [...methods].reverse() })?.value).toBe(
      "preferred-fast@example.org"
    );
    expect(methods[0]!.id).toBe("archived");
  });
  it("keeps a missing contact unaddressed and maps portal contacts to manual submission", () => {
    expect(selectRequestDelivery({ contactMethods: [] }).destinationValue).toBeNull();
    expect(
      selectRequestDelivery({
        contactMethods: [
          {
            type: "PRIVACY_PORTAL_URL",
            value: "https://example.org/privacy",
            isActive: true,
            isVerified: true,
          },
        ],
      })
    ).toEqual({
      channel: "WEB_FORM",
      destinationType: "PRIVACY_PORTAL_URL",
      destinationValue: "https://example.org/privacy",
    });
  });
});
