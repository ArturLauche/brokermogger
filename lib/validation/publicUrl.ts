import { z } from "zod";
import { isPublicHttpUrl } from "@/lib/security/urls";

/** Links opened by a person, never a server-side fetch target. */
export const publicUrlSchema = z
  .url()
  .max(2000)
  .refine(isPublicHttpUrl, "Use an HTTP or HTTPS URL without embedded credentials.");

export const optionalPublicUrlSchema = publicUrlSchema.or(z.literal(""));
