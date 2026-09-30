/**
 * RFC 9116 security.txt body. No HTML, no UI.
 */
import { z } from "zod";
import { parseWithSchema } from "@/lib/validation/form";

const httpsUrl = z
  .string()
  .max(2000)
  .refine((value) => !/[\r\n\u0000]/.test(value))
  .pipe(z.url())
  .refine((value) => new URL(value).protocol === "https:");
const securityTxtSchema = z.object({
  contactEmail: z.email(),
  expiresAt: z.date(),
  canonicalUrl: httpsUrl.optional(),
  policyUrl: httpsUrl.optional(),
  preferredLanguages: z
    .string()
    .max(100)
    .regex(
      /^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*(?:, *[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*)*$/
    )
    .default("en"),
});

export function buildSecurityTxt(input: {
  contactEmail: string;
  canonicalUrl?: string;
  expiresAt: Date;
  policyUrl?: string;
  preferredLanguages?: string;
}): string {
  const valid = parseWithSchema(securityTxtSchema, input);
  const lines = [
    `Contact: mailto:${valid.contactEmail}`,
    `Expires: ${valid.expiresAt.toISOString()}`,
    ...(valid.canonicalUrl ? [`Canonical: ${valid.canonicalUrl}`] : []),
    `Preferred-Languages: ${valid.preferredLanguages}`,
  ];
  if (valid.policyUrl) {
    lines.push(`Policy: ${valid.policyUrl}`);
  }
  return `${lines.join("\n")}\n`;
}
