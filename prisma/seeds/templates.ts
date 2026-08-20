/**
 * Idempotent writer for request templates and their versions.
 *
 * Templates are keyed by their globally unique `key`, versions by (template,
 * version number). The checksum over subject and body is computed here so that
 * a changed body always produces a changed checksum.
 */
import type { PrismaClient } from "@prisma/client";

import { templateChecksum } from "./checksum";
import { REQUEST_TEMPLATES } from "./data/templates";
import { loadJurisdictionIds, requireJurisdictionId } from "./jurisdictions";
import { emptyResult, type SeedStepResult } from "./types";

export async function seedRequestTemplates(
  prisma: PrismaClient
): Promise<SeedStepResult> {
  const result = emptyResult("Request templates");
  const jurisdictionIds = await loadJurisdictionIds(prisma);

  const existing = await prisma.requestTemplate.findMany({
    where: { key: { in: REQUEST_TEMPLATES.map((template) => template.key) } },
    select: { key: true },
  });
  const existingKeys = new Set(existing.map((row) => row.key));

  for (const template of REQUEST_TEMPLATES) {
    const jurisdictionId = template.jurisdictionCode
      ? requireJurisdictionId(jurisdictionIds, template.jurisdictionCode)
      : null;

    const templateData = {
      name: template.name,
      description: template.description,
      requestType: template.requestType,
      channel: template.channel,
      jurisdictionId,
      isActive: template.isActive,
    };

    const stored = await prisma.requestTemplate.upsert({
      where: { key: template.key },
      create: { key: template.key, ...templateData },
      update: templateData,
      select: { id: true },
    });

    if (existingKeys.has(template.key)) {
      result.updated += 1;
    } else {
      result.created += 1;
    }

    const version = template.version;
    const versionData = {
      status: version.status,
      subjectTemplate: version.subjectTemplate,
      bodyTemplate: version.bodyTemplate,
      requiredVariables: version.requiredVariables,
      optionalVariables: version.optionalVariables,
      locale: version.locale,
      changeNotes: version.changeNotes,
      checksum: templateChecksum(version.subjectTemplate, version.bodyTemplate),
    };

    await prisma.requestTemplateVersion.upsert({
      where: { templateId_version: { templateId: stored.id, version: version.version } },
      create: { templateId: stored.id, version: version.version, ...versionData },
      update: versionData,
    });
  }

  const generic = REQUEST_TEMPLATES.filter(
    (template) => template.jurisdictionCode === undefined
  ).length;
  result.notes.push(
    `${generic} generic templates, ${REQUEST_TEMPLATES.length - generic} jurisdiction specific`
  );

  return result;
}
