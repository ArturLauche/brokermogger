import { describe, expect, it } from "vitest";

import { testActor } from "../../helpers/actor";
import { can, requirePermission } from "@/lib/permissions/policy";
import { systemActor } from "@/lib/permissions/actor";
import { ForbiddenError } from "@/lib/core/errors";

describe("authorization policy", () => {
  it("allows a user to read their own request and refuses another account", () => {
    const owner = testActor("user-1");
    expect(can(owner, "request:read", { ownerUserId: "user-1" }).allowed).toBe(true);
    expect(can(owner, "request:read", { ownerUserId: "user-2" }).allowed).toBe(false);
  });

  it("never lets an instance admin reveal identifiers even with a grant", () => {
    const admin = testActor("admin-1", "INSTANCE_ADMIN", {
      adminGrant: {
        adminActionId: "grant-1",
        scope: "user:user-2",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    expect(can(admin, "identifier:reveal", { ownerUserId: "user-2" }).allowed).toBe(
      false
    );
    expect(
      can(admin, "request:read", { ownerUserId: "user-2", scope: "user:user-2" }).allowed
    ).toBe(true);
  });

  it("allows the worker system actor", () => {
    expect(
      can(systemActor("job-1"), "request:send", { ownerUserId: "user-1" }).allowed
    ).toBe(true);
  });

  it("throws ForbiddenError from requirePermission", () => {
    expect(() => requirePermission(testActor("user-1"), "admin:job:manage")).toThrow(
      ForbiddenError
    );
  });
});
