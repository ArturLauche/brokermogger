import { z } from "@/lib/validation/browser";
import { pageInputSchema } from "@/lib/pagination";
import { entityIdSchema } from "@/lib/validation/ids";

export const evidenceChoiceQuerySchema = pageInputSchema.extend({
  search: z.string().trim().max(100).default(""),
});
export const evidenceChoicePageSchema = z.object({
  items: z.array(z.object({ id: entityIdSchema, label: z.string().max(500) })).max(100),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().max(1000).nullable(),
});
export type EvidenceChoicePage = z.infer<typeof evidenceChoicePageSchema>;
