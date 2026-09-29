/** Seed updates append versions; published and operator-maintained history stays intact. */
import type { PrismaClient } from "@prisma/client";
import { templateChecksum } from "./checksum";
import { REQUEST_TEMPLATES } from "./data/templates";
import { loadJurisdictionIds, requireJurisdictionId } from "./jurisdictions";
import { emptyResult, type SeedStepResult } from "./types";
import { hasSameSeedContent } from "./versioning";

export async function seedRequestTemplates(
  prisma: PrismaClient
): Promise<SeedStepResult> {
  const result = emptyResult("Request templates");
  const jurisdictionIds = await loadJurisdictionIds(prisma);
  let addedVersions = 0;
  for (const template of REQUEST_TEMPLATES) {
    const jurisdictionId = template.jurisdictionCode
      ? requireJurisdictionId(jurisdictionIds, template.jurisdictionCode)
      : null;
    const outcome = await prisma.$transaction(async (tx) => {
      const scopeKey = `catalogue:template-scope:${template.requestType}:${template.channel}:${jurisdictionId ?? "generic"}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scopeKey}, 0))`;
      const lockKey = `catalogue:template:${template.key}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const previous = await tx.requestTemplate.findUnique({
        where: { key: template.key },
      });
      const scopeOccupied = !!(await tx.requestTemplate.findFirst({
        where: {
          key: { not: template.key },
          requestType: template.requestType,
          channel: template.channel,
          jurisdictionId,
          isActive: true,
          deletedAt: null,
          versions: { some: { status: "PUBLISHED" } },
        },
        select: { id: true },
      }));
      const data = {
        name: template.name,
        description: template.description,
        requestType: template.requestType,
        channel: template.channel,
        jurisdictionId,
      };
      const reference = await tx.requestTemplate.upsert({
        where: { key: template.key },
        create: {
          key: template.key,
          ...data,
          isActive: template.isActive && !scopeOccupied,
        },
        update: {},
      });
      await tx.$executeRaw`SELECT 1 FROM "RequestTemplate" WHERE id = ${reference.id} FOR UPDATE`;
      const stored = await tx.requestTemplate.findUniqueOrThrow({
        where: { id: reference.id },
      });
      if (!stored.updatedById && !stored.createdById)
        await tx.requestTemplate.update({ where: { id: stored.id }, data });
      const versions = await tx.requestTemplateVersion.findMany({
        where: { templateId: stored.id },
        orderBy: { version: "desc" },
      });
      const source = template.version;
      const desired = {
        status: source.status,
        subjectTemplate: source.subjectTemplate,
        bodyTemplate: source.bodyTemplate,
        requiredVariables: source.requiredVariables,
        optionalVariables: source.optionalVariables,
        locale: source.locale,
        changeNotes: source.changeNotes,
        checksum: templateChecksum(source.subjectTemplate, source.bodyTemplate),
      };
      if (versions.some((version) => hasSameSeedContent(version, desired)))
        return { existed: !!previous, added: false };
      const operatorManaged =
        !!stored.updatedById ||
        !!stored.createdById ||
        versions.some((version) => !!version.createdById);
      const nextVersion = (versions[0]?.version ?? 0) + 1;
      const status = operatorManaged || scopeOccupied ? "DRAFT" : desired.status;
      await tx.requestTemplateVersion.create({
        data: { templateId: stored.id, version: nextVersion, ...desired, status },
      });
      if (status === "PUBLISHED")
        await tx.requestTemplateVersion.updateMany({
          where: {
            templateId: stored.id,
            status: "PUBLISHED",
            version: { lt: nextVersion },
          },
          data: { status: "SUPERSEDED" },
        });
      return { existed: !!previous, added: true };
    });
    if (outcome.existed) result.updated += 1;
    else result.created += 1;
    if (outcome.added) addedVersions += 1;
  }
  result.notes.push(
    `${addedVersions} new versions; published history preserved. Operator-maintained templates receive draft updates.`
  );
  return result;
}
