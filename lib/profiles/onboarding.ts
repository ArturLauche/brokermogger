import { z } from "zod";
import { recordAudit } from "@/lib/audit/service";
import { saveOnboardingRecord } from "@/lib/db/repositories/onboarding";
import type { ActorContext } from "@/lib/permissions/actor";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { identifierInputSchema, profileInputSchema } from "./validation";

const schema = z.object({
  profileId: entityIdSchema.nullable(),
  profile: profileInputSchema,
  identifiers: z.array(identifierInputSchema).max(30),
  complete: z.boolean(),
});

export async function saveOnboardingProfile(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(schema, raw);
  const result = await saveOnboardingRecord(actor, input);
  await recordAudit({
    actor,
    action: "profile.updated",
    resourceType: "profile",
    resourceId: result.profileId,
  });
  return result;
}
