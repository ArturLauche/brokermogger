import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { expect, it } from "vitest";
import { testPrisma } from "../../helpers/db";

it("upgrades proven automatic preparation without relabelling manual choices or corrected targets", async () => {
  const name = `bm_reminder_upgrade_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.searchParams.set("schema", name);
  const directory = mkdtempSync(join(tmpdir(), "bm-reminder-upgrade-"));
  const migration = "20260930030000_deadline_recovery";
  const client = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: url.toString(), options: `-c search_path=\"${name}\"` },
      { schema: name }
    ),
  });
  const migrate = () =>
    execFileSync(
      process.execPath,
      [
        resolve("node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        join(directory, "schema.prisma"),
      ],
      {
        cwd: directory,
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: "pipe",
        timeout: 60000,
      }
    );
  try {
    cpSync("prisma/schema.prisma", join(directory, "schema.prisma"));
    mkdirSync(join(directory, "migrations"));
    // Prisma 7 requires a config file with `datasource.url`; keep it standalone
    // (no `prisma/config` import) so it resolves inside a bare temp directory.
    writeFileSync(
      join(directory, "prisma.config.ts"),
      'export default { schema: "schema.prisma", migrations: { path: "migrations" }, datasource: { url: process.env.DATABASE_URL } };\n'
    );
    for (const entry of readdirSync("prisma/migrations"))
      if (entry === "migration_lock.toml" || entry < migration)
        cpSync(join("prisma/migrations", entry), join(directory, "migrations", entry), {
          recursive: true,
        });
    migrate();
    const user = await client.user.create({ data: { email: `${name}@example.org` } });
    const profile = await client.userProfile.create({
      data: {
        ownerUserId: user.id,
        kind: "SELF",
        consentStatus: "SELF",
        displayName: "Upgrade fixture",
        countryCode: "DE",
      },
    });
    const jurisdiction = await client.jurisdiction.create({
      data: { code: "DE", name: "Synthetic Germany", countryCode: "DE" },
    });
    const target = new Date("2026-09-01T00:00:00.000Z");
    const preparationIds = [
      "auto",
      "manual",
      "auto_corrected",
      "auto_delivered",
      "system_other_status",
      "auto_final",
    ];
    for (const id of [...preparationIds, "handled", "corrected"]) {
      const broker = await client.broker.create({
        data: {
          slug: id,
          legalName: `Synthetic ${id}`,
          category: "PEOPLE_SEARCH",
          isDemoData: true,
          productionSendingEnabled: false,
        },
      });
      const status = preparationIds.includes(id) ? "FOLLOW_UP_SCHEDULED" : "NO_RESPONSE";
      await client.$executeRaw`INSERT INTO "RemovalRequest" (id, "userId", "profileId", "brokerId", "jurisdictionId", "requestType", channel, status, "legalBasisText", "deadlineAt", "sentAt", "approvedAt", "approvedByUserId", "updatedAt") VALUES (${id}, ${user.id}, ${profile.id}, ${broker.id}, ${jurisdiction.id}, 'DELETION', 'WEB_FORM', ${status}::"RequestStatus", 'Synthetic basis', ${target}, '2026-08-01', '2026-08-01', ${user.id}, NOW())`;
      if (status === "FOLLOW_UP_SCHEDULED") {
        await client.removalRequestEvent.create({
          data: {
            removalRequestId: id,
            type: "STATUS_CHANGE",
            toStatus:
              id === "system_other_status" ? "WAITING_FOR_BROKER" : "FOLLOW_UP_SCHEDULED",
            actorType: id === "manual" ? "USER" : "SYSTEM",
            hash: "synthetic-proof",
            createdAt: new Date("2026-09-02"),
          },
        });
        await client.backgroundJob.create({
          data: {
            type: "PREPARE_FOLLOW_UP",
            idempotencyKey: `follow-up:${id}:1`,
            relatedRequestId: id,
            relatedUserId: user.id,
            payloadJson: {
              removalRequestId: id,
              followUpNumber: 1,
              ...(id === "auto_final" ? { kind: "FINAL_REMINDER" } : {}),
            },
            runAt: new Date("2026-10-01"),
          },
        });
        if (id === "auto_corrected" || id === "auto_delivered")
          await client.removalRequestEvent.create({
            data: {
              removalRequestId: id,
              type: id === "auto_corrected" ? "CORRECTION" : "EMAIL_DELIVERED",
              actorType: id === "auto_corrected" ? "USER" : "SYSTEM",
              hash: "synthetic-later-proof",
              createdAt: new Date("2026-09-03"),
            },
          });
      } else {
        await client.notification.create({
          data: {
            userId: user.id,
            removalRequestId: id,
            type: "RECHECK_RECOMMENDED",
            title: "Synthetic handling",
            body: "Synthetic handling",
            dedupeKey: `deadline-handled:${id}:0`,
            createdAt: new Date("2026-09-02"),
          },
        });
        if (id === "corrected")
          await client.removalRequestEvent.create({
            data: {
              removalRequestId: id,
              type: "CORRECTION",
              actorType: "USER",
              hash: "synthetic-proof",
              createdAt: new Date("2026-09-03"),
            },
          });
      }
    }
    cpSync(
      join("prisma/migrations", migration),
      join(directory, "migrations", migration),
      { recursive: true }
    );
    migrate();
    expect(
      (
        await client.backgroundJob.findUniqueOrThrow({
          where: { idempotencyKey: "follow-up:auto:1" },
        })
      ).payloadJson
    ).toEqual({
      removalRequestId: "auto",
      followUpNumber: 1,
      origin: "DEADLINE",
      expectedDeadlineAt: target.toISOString(),
    });
    for (const id of preparationIds.filter((id) => id !== "auto"))
      expect(
        (
          await client.backgroundJob.findUniqueOrThrow({
            where: { idempotencyKey: `follow-up:${id}:1` },
          })
        ).payloadJson
      ).toEqual({
        removalRequestId: id,
        followUpNumber: 1,
        ...(id === "auto_final" ? { kind: "FINAL_REMINDER" } : {}),
      });
    expect(
      await client.removalRequest.findUniqueOrThrow({
        where: { id: "handled" },
        select: { deadlineHandledForAt: true, deadlineHandledFollowUpCount: true },
      })
    ).toEqual({ deadlineHandledForAt: target, deadlineHandledFollowUpCount: 0 });
    expect(
      (
        await client.removalRequest.findUniqueOrThrow({
          where: { id: "corrected" },
          select: { deadlineHandledForAt: true },
        })
      ).deadlineHandledForAt
    ).toBeNull();
    await expect(
      client.auditChainVerification.create({
        data: {
          startedAt: new Date(),
          checkedCount: 1,
          isValid: false,
          problemSequence: 1n,
          problemKind: null,
        },
      })
    ).rejects.toThrow();
    migrate();
    expect(await client.removalRequest.count()).toBe(8);
  } finally {
    await client.$disconnect();
    await testPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
    rmSync(directory, { recursive: true, force: true });
  }
}, 120000);
