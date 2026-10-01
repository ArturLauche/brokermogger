import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { evidenceChoiceQuerySchema } from "@/lib/evidence/choices";
import { createdBeforeCursor, cursorPage } from "@/lib/pagination";
import type { ActorContext } from "@/lib/permissions/actor";
import { parseWithSchema } from "@/lib/validation/form";
import { requireOwnedRequestPrivate } from "./requests";

/** Only attachable, masked choices. File keys, content and identity documents stay private. */
export async function listRequestEvidenceChoices(
  actor: ActorContext,
  requestId: string,
  raw: unknown = {}
) {
  const request = await requireOwnedRequestPrivate(actor, requestId);
  const input = parseWithSchema(evidenceChoiceQuerySchema, raw);
  const where: Prisma.EvidenceFileWhereInput = {
    userId: request.userId,
    removalRequestId: request.id,
    deletedAt: null,
    storageState: "READY",
    kind: { notIn: ["IDENTITY_DOCUMENT", "ACCOUNT_EXPORT"] },
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      ...(input.search
        ? [{ filenameMasked: { contains: input.search, mode: "insensitive" as const } }]
        : []),
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.evidenceFile.findMany({
      where: { AND: [where, createdBeforeCursor(input.cursor)] },
      select: { id: true, createdAt: true, filenameMasked: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    }),
    prisma.evidenceFile.count({ where }),
  ]);
  const page = cursorPage(rows, input.limit);
  return {
    ...page,
    total,
    items: page.items.map((row) => ({
      id: row.id,
      label: row.filenameMasked ?? `File ${row.id.slice(0, 8)}`,
    })),
  };
}
