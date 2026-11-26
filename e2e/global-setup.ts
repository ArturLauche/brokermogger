import { PrismaClient } from "./db";
import { seedJurisdictions } from "../prisma/seeds/jurisdictions";
import { seedLegalRules } from "../prisma/seeds/legalRules";
import { seedRequestTemplates } from "../prisma/seeds/templates";
import { assertIsolatedBrowserEnvironment } from "./helpers";

/** Prepare public reference fixtures before any page can warm catalogue caches. */
export default async function setupBrowserCatalogue() {
  assertIsolatedBrowserEnvironment();
  const db = new PrismaClient();
  try {
    await seedJurisdictions(db);
    await seedLegalRules(db);
    await seedRequestTemplates(db);
  } finally {
    await db.$disconnect();
  }
}
