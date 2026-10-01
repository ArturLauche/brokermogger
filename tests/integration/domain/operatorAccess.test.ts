import { describe, expect, it } from "vitest";
import {
  listAdminJobs,
  listAdminAudit,
  createBreakGlassGrant,
  findActiveGrantForAdmin,
  retryJobRow,
  cancelJobRow,
  revokeAdminAction,
} from "@/lib/db/repositories/admin";
import { saveAdminSetting } from "@/lib/db/repositories/adminSettings";
import { listTemplateAdministration } from "@/lib/db/repositories/adminTemplates";
import { listLegalRuleAdministration } from "@/lib/db/repositories/adminLegalRules";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";

describe("operator repository boundaries", () => {
  it("rejects a demoted administrator's captured identity at every operational write", async () => {
    const operator = await testPrisma.user.create({
      data: { email: "demoted@example.org", role: "INSTANCE_ADMIN" },
    });
    const target = await testPrisma.user.create({
      data: { email: "target@example.org" },
    });
    const actor = testActor(operator.id, "INSTANCE_ADMIN");
    const grantInput = {
      targetUserId: target.id,
      justification: "Investigate synthetic metadata for a test.",
      durationHours: 1,
    };
    const grant = await createBreakGlassGrant(actor, grantInput);
    const job = await testPrisma.backgroundJob.create({
      data: {
        type: "RETENTION_SWEEP",
        payloadJson: { dryRun: true },
        idempotencyKey: "demoted-operator",
        status: "FAILED",
      },
    });
    await testPrisma.user.update({
      where: { id: actor.userId },
      data: { role: "MAINTAINER" },
    });
    for (const operation of [
      () => retryJobRow(actor, job.id),
      () => cancelJobRow(actor, job.id),
      () => revokeAdminAction(actor, grant.id),
      () => createBreakGlassGrant(actor, grantInput),
      () =>
        saveAdminSetting(actor, {
          key: "instance.operator_note",
          value: "Blocked",
          expectedUpdatedAt: "",
          intent: "save",
        }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await testPrisma.backgroundJob.findUniqueOrThrow({ where: { id: job.id } })).status
    ).toBe("FAILED");
    expect(
      (await testPrisma.adminAction.findUniqueOrThrow({ where: { id: grant.id } }))
        .revokedAt
    ).toBeNull();
    expect(await testPrisma.systemSetting.count()).toBe(0);
  });
  it("denies operational access to maintainers and excludes job payloads from listings", async () => {
    const user = await testPrisma.user.create({
      data: { email: "operator@example.org", role: "INSTANCE_ADMIN" },
    });
    const actor = testActor(user.id, "INSTANCE_ADMIN");
    const job = await testPrisma.backgroundJob.create({
      data: {
        type: "RETENTION_SWEEP",
        payloadJson: { privateExample: "never-list-this" },
        idempotencyKey: "operator-list",
        status: "FAILED",
      },
    });
    for (const role of ["USER", "MAINTAINER"] as const) {
      const other = { ...actor, role };
      await expect(listAdminJobs(other)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(listAdminAudit(other)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(retryJobRow(other, job.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(cancelJobRow(other, job.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(findActiveGrantForAdmin(other)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    expect(JSON.stringify(await listAdminJobs(actor))).not.toContain("never-list-this");
    await expect(
      listLegalRuleAdministration({ ...actor, role: "USER" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      listTemplateAdministration({ ...actor, role: "USER" })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await retryJobRow(actor, job.id);
    await cancelJobRow(actor, job.id);
    await expect(retryJobRow(actor, job.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("validates emergency grants at persistence and binds the operator identity", async () => {
    const operator = await testPrisma.user.create({
      data: { email: "operator@example.org", role: "INSTANCE_ADMIN" },
    });
    const target = await testPrisma.user.create({
      data: { email: "target@example.org" },
    });
    const actor = testActor(operator.id, "INSTANCE_ADMIN");
    const input = {
      targetUserId: target.id,
      justification: "Investigate a user-reported metadata problem.",
      durationHours: 1,
    };
    await expect(
      createBreakGlassGrant(actor, { ...input, durationHours: 25 })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      createBreakGlassGrant(actor, { ...input, durationHours: NaN })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const grant = await createBreakGlassGrant(actor, {
      ...input,
      adminUserId: target.id,
    });
    expect(grant.adminUserId).toBe(actor.userId);
    expect((await findActiveGrantForAdmin(actor))?.id).toBe(grant.id);
    expect(
      await findActiveGrantForAdmin(testActor(target.id, "INSTANCE_ADMIN"))
    ).toBeNull();
  });
});
