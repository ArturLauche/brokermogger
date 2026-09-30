/**
 * Idempotent writer for the jurisdiction catalogue.
 *
 * Jurisdictions are keyed by their stable `code`, so re-running the seed
 * updates the existing rows instead of creating duplicates.
 */
import type { PrismaClient } from "@prisma/client";

import { JURISDICTIONS } from "./data/jurisdictions";
import { emptyResult, type SeedStepResult } from "./types";

export async function seedJurisdictions(prisma: PrismaClient): Promise<SeedStepResult> {
  const result = emptyResult("Jurisdictions");

  const existing = await prisma.jurisdiction.findMany({
    where: { code: { in: JURISDICTIONS.map((jurisdiction) => jurisdiction.code) } },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((row) => row.code));

  for (const jurisdiction of JURISDICTIONS) {
    const data = {
      name: jurisdiction.name,
      countryCode: jurisdiction.countryCode,
      region: jurisdiction.region ?? null,
      description: jurisdiction.description,
      sortOrder: jurisdiction.sortOrder,
    };

    await prisma.jurisdiction.upsert({
      where: { code: jurisdiction.code },
      create: { code: jurisdiction.code, ...data, isActive: jurisdiction.isActive },
      update: data,
    });

    if (existingCodes.has(jurisdiction.code)) {
      result.updated += 1;
    } else {
      result.created += 1;
    }
  }

  return result;
}

/** Maps jurisdiction codes to database ids for the dependent writers. */
export async function loadJurisdictionIds(
  prisma: PrismaClient
): Promise<Map<string, string>> {
  const rows = await prisma.jurisdiction.findMany({ select: { id: true, code: true } });
  return new Map(rows.map((row) => [row.code, row.id]));
}

export function requireJurisdictionId(ids: Map<string, string>, code: string): string {
  const id = ids.get(code);
  if (!id) {
    throw new Error(
      `Unknown jurisdiction code "${code}". Seed the jurisdictions before the dependent data.`
    );
  }
  return id;
}
