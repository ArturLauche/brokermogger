import { describe, expect, it } from "vitest";
import { changeSetting } from "@/lib/admin/settings";
import { getSetting } from "@/lib/config/runtimeSettings";
import { listAdminSettings, saveAdminSetting } from "@/lib/db/repositories/adminSettings";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";

async function admin() {
  const user = await testPrisma.user.create({
    data: { email: "operator@example.org", role: "INSTANCE_ADMIN" },
  });
  return testActor(user.id, "INSTANCE_ADMIN");
}
const setting = {
  key: "fair_use.requests_per_day",
  value: "17",
  expectedUpdatedAt: "",
  intent: "save",
};

describe("operator settings", () => {
  it("commits a setting and its mandatory audit together and invalidates cached values only after success", async () => {
    const actor = await admin();
    expect(await getSetting("fairUseRequestsPerDay")).toBe(25);
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_reject_setting_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'admin.setting_changed' THEN RAISE EXCEPTION 'Injected setting audit failure'; END IF; RETURN NEW; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_reject_setting_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION test_reject_setting_audit()`
    );
    try {
      await expect(changeSetting(actor, setting)).rejects.toThrow(/audit failure/);
      expect(await testPrisma.systemSetting.count()).toBe(0);
      expect(await getSetting("fairUseRequestsPerDay")).toBe(25);
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_reject_setting_audit ON "AuditLog"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_reject_setting_audit()`);
    }
    await changeSetting(actor, setting);
    expect(await getSetting("fairUseRequestsPerDay")).toBe(17);
    expect(
      await testPrisma.auditLog.count({ where: { action: "admin.setting_changed" } })
    ).toBe(1);
  });

  it("enforces repository authorization and validates typed values and public URLs", async () => {
    const actor = await admin();
    for (const role of ["USER", "MAINTAINER"] as const) {
      await expect(saveAdminSetting({ ...actor, role }, setting)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(listAdminSettings({ ...actor, role })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    for (const command of [
      { ...setting, value: "" },
      { ...setting, value: "1001" },
      { ...setting, key: "unknown.key" },
      { ...setting, key: "sending.enabled_by_admin", value: "yes" },
      { ...setting, key: "instance.repository_url", value: "javascript:alert(1)" },
      {
        ...setting,
        key: "instance.documentation_url",
        value: "https://operator:secret@example.org",
      },
    ])
      await expect(saveAdminSetting(actor, command)).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
      });
    expect(await testPrisma.systemSetting.count()).toBe(0);
  });

  it("prevents competing edits, invalidates runtime values and resets a setting", async () => {
    const actor = await admin();
    expect(await getSetting("fairUseRequestsPerDay")).toBe(25);
    const competing = await Promise.allSettled([
      changeSetting(actor, setting),
      changeSetting(actor, { ...setting, value: "18" }),
    ]);
    expect(competing.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(competing.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    const stored = await testPrisma.systemSetting.findUniqueOrThrow({
      where: { key: setting.key },
    });
    expect(await getSetting("fairUseRequestsPerDay")).toBe(stored.valueJson);
    await changeSetting(actor, {
      ...setting,
      expectedUpdatedAt: stored.updatedAt.toISOString(),
      intent: "reset",
    });
    expect(await getSetting("fairUseRequestsPerDay")).toBe(25);
    expect(
      await testPrisma.auditLog.count({ where: { action: "admin.setting_changed" } })
    ).toBe(2);
  });

  it("shows invalid stored values honestly and blocks inactive operators", async () => {
    const actor = await admin();
    const sensitive = await testPrisma.systemSetting.create({
      data: {
        key: "instance.operator_note",
        description: "Private legacy override",
        valueJson: "synthetic-private-value",
        isSensitive: true,
      },
    });
    expect(
      (await listAdminSettings(actor)).some((row) => row.key === sensitive.key)
    ).toBe(false);
    await expect(
      saveAdminSetting(actor, {
        ...setting,
        key: sensitive.key,
        value: "replacement",
        expectedUpdatedAt: sensitive.updatedAt.toISOString(),
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await testPrisma.systemSetting.create({
      data: { key: setting.key, description: "Legacy", valueJson: -1 },
    });
    expect(
      (await listAdminSettings(actor)).find((s) => s.key === setting.key)
    ).toMatchObject({ value: "25", invalid: true });
    await testPrisma.user.update({
      where: { id: actor.userId },
      data: { status: "PENDING_DELETION" },
    });
    await expect(saveAdminSetting(actor, setting)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
