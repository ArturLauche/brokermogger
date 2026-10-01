import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { expect, it } from "vitest";
import { testPrisma } from "../../helpers/db";

it("rehearses the additive response-clock upgrade with submitted and unsent legacy history", async () => {
  const name = `bm_target_upgrade_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.TEST_DATABASE_URL!);
  url.searchParams.set("schema", name);
  const directory = mkdtempSync(join(tmpdir(), "bm-target-upgrade-"));
  const migration = "20260930010000_response_targets";
  const client = new PrismaClient({ datasourceUrl: url.toString() });
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
        timeout: 60_000,
      }
    );
  try {
    cpSync("prisma/schema.prisma", join(directory, "schema.prisma"));
    mkdirSync(join(directory, "migrations"));
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
        displayName: "Synthetic upgrade profile",
        countryCode: "DE",
      },
    });
    const jurisdiction = await client.jurisdiction.create({
      data: { code: "DE", name: "Synthetic Germany", countryCode: "DE" },
    });
    const broker = await client.broker.create({
      data: {
        slug: name,
        legalName: "Synthetic migration broker",
        category: "PEOPLE_SEARCH",
        isDemoData: true,
        productionSendingEnabled: false,
      },
    });
    const deadline = new Date("2026-10-31T12:00:00Z");
    const sentAt = new Date("2026-10-01T12:00:00Z");
    for (const id of ["legacy-sent", "legacy-draft"])
      await client.$executeRaw`INSERT INTO "RemovalRequest" (id, "userId", "profileId", "brokerId", "jurisdictionId", "requestType", channel, status, "legalBasisText", "deadlineAt", "sentAt", "approvedAt", "approvedByUserId", "updatedAt")
        VALUES (${id}, ${user.id}, ${profile.id}, ${broker.id}, ${jurisdiction.id}, ${id === "legacy-sent" ? "DELETION" : "ACCESS"}::"RequestType", 'EMAIL', ${id === "legacy-sent" ? "SENT" : "DRAFT"}::"RequestStatus", 'Synthetic historical basis', ${deadline}, ${id === "legacy-sent" ? sentAt : null}, ${id === "legacy-sent" ? sentAt : null}, ${id === "legacy-sent" ? user.id : null}, NOW())`;
    const snapshot = await client.requestSnapshot.create({
      data: {
        removalRequestId: "legacy-sent",
        version: 1,
        subject: "Historical synthetic subject",
        body: "Historical synthetic approved text",
        contentHash: "historical-hash",
        identifierDigest: "historical-identifiers",
      },
    });
    await client.$executeRaw`UPDATE "RemovalRequest" SET "currentSnapshotId" = ${snapshot.id}, "approvedSnapshotId" = ${snapshot.id} WHERE id = 'legacy-sent'`;
    await client.notification.create({
      data: {
        userId: user.id,
        removalRequestId: "legacy-sent",
        type: "DEADLINE_APPROACHING",
        title: "Synthetic old reminder",
        body: "Synthetic old reminder.",
        dedupeKey: "deadline-warning:legacy-sent",
      },
    });
    cpSync(
      join("prisma/migrations", migration),
      join(directory, "migrations", migration),
      { recursive: true }
    );
    migrate();
    const sent = await client.removalRequest.findUniqueOrThrow({
      where: { id: "legacy-sent" },
      select: {
        status: true,
        sentAt: true,
        deadlineAt: true,
        deadlineOn: true,
        deadlineBasis: true,
        deadlineIsEstimate: true,
        deadlinePolicyVersion: true,
        currentSnapshotId: true,
        approvedSnapshotId: true,
        deadlineWarningForAt: true,
      },
    });
    expect(sent).toMatchObject({
      status: "SENT",
      sentAt,
      deadlineAt: deadline,
      deadlineOn: new Date("2026-10-31"),
      deadlineBasis: "LEGACY_ESTIMATE",
      deadlineIsEstimate: true,
      deadlinePolicyVersion: null,
      currentSnapshotId: snapshot.id,
      approvedSnapshotId: snapshot.id,
      deadlineWarningForAt: deadline,
    });
    const draft = await client.removalRequest.findUniqueOrThrow({
      where: { id: "legacy-draft" },
      select: {
        status: true,
        sentAt: true,
        deadlineAt: true,
        deadlineOn: true,
        deadlineBasis: true,
      },
    });
    expect(draft).toMatchObject({
      status: "DRAFT",
      sentAt: null,
      deadlineAt: null,
      deadlineOn: null,
      deadlineBasis: null,
    });
    expect(
      await client.requestSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } })
    ).toMatchObject({
      body: snapshot.body,
      contentHash: snapshot.contentHash,
      version: 1,
    });
    expect(await client.removalRequest.count()).toBe(2);
    migrate(); // Deployment re-entry is idempotent.
    expect(await client.requestSnapshot.count()).toBe(1);
  } finally {
    await client.$disconnect();
    await testPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
    rmSync(directory, { recursive: true, force: true });
  }
}, 120_000);
