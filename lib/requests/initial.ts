import { z } from "zod";
import type { RequestType } from "@prisma/client";
import { entityIdSchema } from "@/lib/validation/ids";
import { MAX_BROKERS_PER_WORKFLOW } from "./fairUse";

/** Later correspondence must use the existing request's history and consent. */
export const INITIAL_REQUEST_TYPES = [
  "DELETION",
  "ACCESS",
  "CORRECTION",
  "OBJECTION",
  "OPT_OUT",
  "SUPPRESSION",
  "CONSENT_WITHDRAWAL",
] as const satisfies readonly RequestType[];

export const workflowSchema = z.object({
  profileId: entityIdSchema,
  requestType: z.enum(INITIAL_REQUEST_TYPES),
  brokerIds: z
    .array(entityIdSchema)
    .min(1, "Select at least one broker.")
    .max(MAX_BROKERS_PER_WORKFLOW)
    .transform((ids) => [...new Set(ids)]),
  identifierIds: z
    .array(entityIdSchema)
    .min(1, "Select at least one matching identifier.")
    .max(100)
    .transform((ids) => [...new Set(ids)]),
});

export function applicableInitialTypes(
  supported: readonly RequestType[],
  templated: readonly RequestType[]
) {
  return INITIAL_REQUEST_TYPES.filter(
    (type) => supported.includes(type) && templated.includes(type)
  );
}
