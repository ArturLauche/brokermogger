import { randomUUID } from "node:crypto";

import { addIdentifier, createSelfProfile } from "@/lib/db/repositories/profiles";
import { seedJurisdictions } from "@/prisma/seeds/jurisdictions";
import { seedLegalRules } from "@/prisma/seeds/legalRules";
import { seedRequestTemplates } from "@/prisma/seeds/templates";

import { testActor } from "./actor";
import { testPrisma } from "./db";

export async function workflowFixture(brokerCount = 1) {
  await seedJurisdictions(testPrisma);
  await seedLegalRules(testPrisma);
  await seedRequestTemplates(testPrisma);
  const user = await testPrisma.user.create({
    data: { email: `${randomUUID()}@example.org`, createdAt: new Date("2025-01-01") },
  });
  const actor = testActor(user.id);
  const profile = await createSelfProfile(actor, {
    displayName: "My profile",
    legalName: "Alex Sample",
    countryCode: "DE",
    region: null,
    residencyConfirmed: true,
    contactEmail: "alex@example.org",
  });
  const identifier = await addIdentifier(actor, profile.id, {
    type: "EMAIL",
    value: "alex@example.org",
    label: "Personal email",
    isPrimary: true,
  });
  const jurisdiction = await testPrisma.jurisdiction.findFirstOrThrow({
    where: { countryCode: "DE" },
  });
  const brokers = [];
  for (let index = 0; index < brokerCount; index += 1) {
    brokers.push(
      await testPrisma.broker.create({
        data: {
          slug: `workflow-${randomUUID()}`,
          legalName: `Example broker ${index + 1}`,
          category: "PEOPLE_SEARCH",
          isDemoData: true,
          productionSendingEnabled: false,
          contactMethods: {
            create: {
              type: "EMAIL",
              value: "privacy@example.org",
              isPreferred: true,
              isVerified: false,
            },
          },
          jurisdictionCoverage: { create: { jurisdictionId: jurisdiction.id } },
        },
      })
    );
  }
  return {
    user,
    actor,
    profile,
    identifier,
    brokers,
    input: {
      profileId: profile.id,
      brokerIds: brokers.map((broker) => broker.id),
      identifierIds: [identifier.id],
      requestType: "DELETION" as const,
    },
  };
}
