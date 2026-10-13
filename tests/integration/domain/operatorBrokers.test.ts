import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  saveBrokerRecord,
  saveBrokerContact,
  saveBrokerCoverage,
  changeBrokerSending,
  getBrokerAdministration,
  listBrokerAdministration,
} from "@/lib/db/repositories/adminBrokers";
import { createPreparedDrafts } from "@/lib/db/repositories/requestGeneration";
import { prepareRequestDrafts } from "@/lib/requests/generation";
import { seedBrokers } from "@/prisma/seeds/brokers";
import { seedJurisdictions } from "@/prisma/seeds/jurisdictions";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

const brokerInput = () => ({
  brokerId: "",
  expectedUpdatedAt: "",
  slug: `operator-${randomUUID()}`,
  legalName: "Operator example broker",
  websiteUrl: "https://example.org",
  category: "PEOPLE_SEARCH",
  tradingNames: "Example directory",
  countriesServed: "DE,US",
  dataCategories: "IDENTITY,CONTACT",
  sourceUrl: "https://example.org/privacy",
  lastVerifiedAt: new Date().toISOString().slice(0, 10),
  verificationStatus: "CONTACT_VERIFIED",
  confidenceScore: "80",
  isActive: "true",
  isDemoData: "false",
  productionUnsafeFlag: "false",
  manualReviewRequired: "true",
  expectsIdentityDocument: "false",
  accountRequired: "false",
  notarisationRequired: "false",
  verificationInstructions: "",
  riskTier: "STANDARD",
  notes: "Synthetic operator test entry.",
});
const contactInput = {
  contactId: "",
  type: "EMAIL",
  value: "privacy@example.org",
  label: "Privacy contact",
  isActive: "true",
  isPreferred: "true",
  priority: "10",
  isVerified: "true",
  verifiedAt: new Date().toISOString().slice(0, 10),
  sourceUrl: "https://example.org/privacy",
  verificationNote: "Synthetic verification evidence; no external contact.",
};
async function maintainer() {
  const user = await testPrisma.user.create({
    data: { email: `${randomUUID()}@example.org`, role: "MAINTAINER" },
  });
  return testActor(user.id, "MAINTAINER");
}
async function scope(id: string) {
  const row = await testPrisma.broker.findUniqueOrThrow({ where: { id } });
  return { brokerId: id, expectedUpdatedAt: row.updatedAt.toISOString() };
}

describe("operator broker editing", () => {
  it("checks repository permissions, verification evidence, URLs and request-type eligibility", async () => {
    const actor = await maintainer();
    await expect(
      saveBrokerRecord({ ...actor, role: "USER" }, brokerInput())
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      listBrokerAdministration({ ...actor, role: "USER" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      saveBrokerRecord(actor, { ...brokerInput(), websiteUrl: "javascript:alert(1)" })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const broker = await saveBrokerRecord(actor, brokerInput());
    await expect(
      changeBrokerSending(actor, { ...(await scope(broker.id)), enabled: "true" })
    ).rejects.toMatchObject({ code: "BROKER_NOT_SENDABLE" });
    await expect(
      saveBrokerContact(actor, {
        ...(await scope(broker.id)),
        ...contactInput,
        verificationNote: "",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      saveBrokerContact(actor, {
        ...(await scope(broker.id)),
        ...contactInput,
        value: "valid@example.org\nBcc: other@example.org",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await saveBrokerContact(actor, { ...(await scope(broker.id)), ...contactInput });
    await seedJurisdictions(testPrisma);
    const jurisdiction = await testPrisma.jurisdiction.findUniqueOrThrow({
      where: { code: "DE" },
    });
    const coverage = {
      ...(await scope(broker.id)),
      jurisdictionId: jurisdiction.id,
      coverageType: "STATUTORY",
      supportedRequestTypes: "DELETION",
      confidence: "HIGH",
      isActive: "true",
      notes: "Synthetic source https://example.org/privacy with scope conditions.",
    };
    await expect(
      saveBrokerCoverage(actor, { ...coverage, supportedRequestTypes: "FOLLOW_UP" })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await saveBrokerCoverage(actor, coverage);
    await changeBrokerSending(actor, { ...(await scope(broker.id)), enabled: "true" });
    expect(
      (await getBrokerAdministration(actor, broker.id)).productionSendingEnabled
    ).toBe(true);
    const method = await testPrisma.brokerContactMethod.findFirstOrThrow({
      where: { brokerId: broker.id },
    });
    await saveBrokerContact(actor, {
      ...(await scope(broker.id)),
      ...contactInput,
      contactId: method.id,
      isActive: "false",
      isVerified: "false",
    });
    expect(
      (await getBrokerAdministration(actor, broker.id)).productionSendingEnabled
    ).toBe(false);
    expect(
      await testPrisma.brokerContactMethod.findUniqueOrThrow({ where: { id: method.id } })
    ).toMatchObject({
      isActive: false,
      isVerified: false,
      verifiedAt: null,
      verifiedBy: null,
    });
    await expect(
      changeBrokerSending(actor, { ...(await scope(broker.id)), enabled: "true" })
    ).rejects.toMatchObject({ code: "BROKER_NOT_SENDABLE" });
  });

  it("scopes child IDs and rolls back contacts if the parent mutation fails", async () => {
    const actor = await maintainer();
    const first = await saveBrokerRecord(actor, brokerInput());
    const second = await saveBrokerRecord(actor, brokerInput());
    await saveBrokerContact(actor, { ...(await scope(first.id)), ...contactInput });
    const method = await testPrisma.brokerContactMethod.findFirstOrThrow({
      where: { brokerId: first.id },
    });
    await expect(
      saveBrokerContact(actor, {
        ...(await scope(second.id)),
        ...contactInput,
        contactId: method.id,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION operator_reject_broker_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected parent failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER operator_reject_update BEFORE UPDATE ON "Broker" FOR EACH ROW EXECUTE FUNCTION operator_reject_broker_update()`
    );
    try {
      await expect(
        saveBrokerContact(actor, { ...(await scope(second.id)), ...contactInput })
      ).rejects.toThrow();
      expect(
        await testPrisma.brokerContactMethod.count({ where: { brokerId: second.id } })
      ).toBe(0);
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER operator_reject_update ON "Broker"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION operator_reject_broker_update()`);
    }
  });

  it("rejects stale competing edits and preserves operator changes across demo seeding", async () => {
    const actor = await maintainer();
    await seedJurisdictions(testPrisma);
    await seedBrokers(testPrisma);
    const row = await testPrisma.broker.findUniqueOrThrow({
      where: { slug: "northwind-people-finder" },
    });
    const current = await scope(row.id);
    const outcomes = await Promise.allSettled([
      saveBrokerRecord(actor, {
        ...brokerInput(),
        ...current,
        slug: row.slug,
        isDemoData: "true",
        legalName: "Operator-owned demo",
      }),
      saveBrokerContact(actor, {
        ...current,
        ...contactInput,
        value: "operator@example.org",
      }),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    const before = await getBrokerAdministration(actor, row.id);
    await seedBrokers(testPrisma);
    expect(await getBrokerAdministration(actor, row.id)).toEqual(before);
  });

  it("paginates every broker without loading contact payloads or accepting oversized pages", async () => {
    const actor = await maintainer();
    await testPrisma.broker.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        slug: `page-${i}`,
        legalName: `Page broker ${i}`,
        category: "PEOPLE_SEARCH" as const,
      })),
    });
    const ids = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await listBrokerAdministration(actor, {
        ...(cursor ? { cursor } : {}),
      });
      expect(page.items.length).toBeLessThanOrEqual(25);
      expect(page.total).toBe(101);
      for (const row of page.items) {
        expect(ids.has(row.id)).toBe(false);
        ids.add(row.id);
        expect(row).not.toHaveProperty("contactMethods");
      }
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids.size).toBe(101);
    await expect(listBrokerAdministration(actor, { limit: 101 })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(
      listBrokerAdministration(actor, { cursor: "invalid" })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("enforces configured compatibility before rendering and again before spending quota", async () => {
    const fixture = await workflowFixture();
    const broker = fixture.brokers[0]!;
    await testPrisma.broker.update({
      where: { id: broker.id },
      data: {
        riskTier: "ELEVATED",
        manualReviewRequired: true,
        legalName: "A".repeat(200),
      },
    });
    const { drafts, fairUse } = await prepareRequestDrafts(fixture.actor, fixture.input);
    expect(drafts[0]!.manualReviewReasons.join(" ")).toContain(
      "catalogue requires manual review"
    );
    expect(drafts[0]!.manualReviewReasons.join(" ")).toContain(
      "elevated review category"
    );
    await testPrisma.brokerJurisdictionCoverage.updateMany({
      where: { brokerId: broker.id },
      data: { supportedRequestTypes: ["SUPPRESSION"] },
    });
    await expect(
      prepareRequestDrafts(fixture.actor, fixture.input)
    ).rejects.toMatchObject({ code: "BROKER_NOT_SENDABLE" });
    await expect(
      createPreparedDrafts(fixture.actor, drafts, fairUse)
    ).rejects.toMatchObject({ code: "BROKER_NOT_SENDABLE" });
    expect(await testPrisma.removalRequest.count()).toBe(0);
    expect(await testPrisma.rateLimitBucket.count()).toBe(0);
  });
});

it("offers bounded review filters and keeps operator evidence out of public broker results", async () => {
  const { listBrokersForDirectory, getBrokerWithContacts, getSelectedBrokersForChoice } =
    await import("@/lib/db/repositories/catalog");
  const actor = await maintainer();
  const broker = await saveBrokerRecord(actor, {
    ...brokerInput(),
    isActive: "false",
    verificationStatus: "SOURCE_FOUND",
    lastVerifiedAt: "",
  });
  await saveBrokerContact(actor, { ...(await scope(broker.id)), ...contactInput });
  expect(
    (await listBrokerAdministration(actor, { status: "real_drafts" })).items.map(
      (row) => row.id
    )
  ).toEqual([broker.id]);
  expect(
    (await listBrokerAdministration(actor, { status: "stale" })).items.map(
      (row) => row.id
    )
  ).toEqual([broker.id]);
  await expect(
    listBrokerAdministration({ ...actor, role: "USER" }, { status: "stale" })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  const views = [
    await listBrokersForDirectory(),
    await getBrokerWithContacts(broker.id),
    await getSelectedBrokersForChoice([broker.id]),
  ];
  for (const view of views)
    expect(JSON.stringify(view)).not.toContain(contactInput.verificationNote);
  expect((await getBrokerWithContacts(broker.id))?.readiness).toMatchObject({
    canPrepare: false,
    activationReady: false,
  });
  expect(
    (await getBrokerAdministration(actor, broker.id)).contactMethods[0]?.verificationNote
  ).toBe(contactInput.verificationNote);
});
