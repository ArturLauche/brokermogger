import { RequestStatus } from "@prisma/client";
import { z } from "zod";
import { pageInputSchema } from "@/lib/pagination";
import { requestTypeSchema } from "@/lib/validation/enums";

export const requestListSchema = pageInputSchema.extend({
  search: z.string().trim().max(100).default(""),
  status: z.union([z.literal("all"), z.enum(RequestStatus)]).default("all"),
  requestType: z.union([z.literal("all"), requestTypeSchema]).default("all"),
});
