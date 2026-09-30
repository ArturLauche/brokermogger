import { z } from "zod";
import { pageInputSchema } from "@/lib/pagination";
import { evidenceKindSchema } from "@/lib/validation/enums";

export const evidenceListSchema = pageInputSchema.extend({
  search: z.string().trim().max(100).default(""),
  kind: z.union([z.literal("all"), evidenceKindSchema]).default("all"),
  expiry: z.enum(["all", "available", "expired"]).default("all"),
});
