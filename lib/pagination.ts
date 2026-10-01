import { z } from "zod";
import { ValidationError } from "@/lib/core/errors";

export const pageInputSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(1000).optional(),
});
const cursorSchema = z.object({
  id: z.string().min(1).max(200),
  createdAt: z.iso.datetime(),
});

export function createdBeforeCursor(value: string | undefined) {
  if (!value) return {};
  let cursor: z.infer<typeof cursorSchema>;
  try {
    cursor = cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8"))
    );
  } catch {
    throw new ValidationError(
      "This page link is invalid. Open the first page and try again."
    );
  }
  const createdAt = new Date(cursor.createdAt);
  // The redundant upper bound lets PostgreSQL seek into an ordered index rather
  // than scanning every newer row before evaluating the equal-timestamp tie.
  return {
    createdAt: { lte: createdAt },
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }],
  };
}

export function cursorPage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number
) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({ id: last.id, createdAt: last.createdAt.toISOString() })
          ).toString("base64url")
        : null,
  };
}
