import { IdentifierType } from "@prisma/client";
import { z } from "zod";
import { normalizeUsState } from "@/lib/jurisdiction/locations";
import { COUNTRY_NAMES } from "@/lib/jurisdiction/types";
import { sanitiseText } from "@/lib/security/sanitize";

export const profileInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    legalName: z.string().trim().min(2).max(120),
    contactEmail: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value in COUNTRY_NAMES, "Choose a country from the list."),
    region: z.string().trim().max(80).nullable(),
    residencyConfirmed: z.literal(true, { error: "Confirm where this person lives." }),
  })
  .superRefine((input, context) => {
    if (input.countryCode === "US" && !normalizeUsState(input.region ?? ""))
      context.addIssue({
        code: "custom",
        path: ["region"],
        message: "Select a US state or the District of Columbia.",
      });
  })
  .transform((input) => {
    const legalName = sanitiseText(input.legalName, {
      fieldName: "legalName",
      maxLength: 120,
    });
    const label = sanitiseText(input.displayName, {
      fieldName: "displayName",
      maxLength: 80,
    });
    return {
      ...input,
      legalName,
      displayName:
        label.toLocaleLowerCase() === legalName.toLocaleLowerCase()
          ? "My profile"
          : label,
      region:
        input.countryCode === "US"
          ? normalizeUsState(input.region ?? "")
          : input.region
            ? sanitiseText(input.region, { fieldName: "region", maxLength: 80 })
            : null,
    };
  });
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const identifierInputSchema = z
  .object({
    type: z.enum(IdentifierType),
    value: z.string().trim().min(1).max(200),
    label: z.string().trim().max(80).optional(),
    isPrimary: z.boolean().optional(),
  })
  .superRefine((input, context) => {
    if (input.type === "EMAIL" && !z.email().safeParse(input.value).success)
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Enter a valid email address.",
      });
    if (input.type === "PHONE" && !/^\+?[0-9(). -]{7,40}$/.test(input.value))
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Enter a phone number with its country code if known.",
      });
  })
  .transform((input) => ({
    ...input,
    value: sanitiseText(
      input.type === "EMAIL" ? input.value.toLowerCase() : input.value,
      { fieldName: "value", maxLength: 200 }
    ),
  }));
export type IdentifierInput = z.infer<typeof identifierInputSchema>;

export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid timezone, such as Europe/Berlin, America/New_York or UTC.");
