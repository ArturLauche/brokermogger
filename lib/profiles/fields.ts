import { blindIndex, encryptField } from "@/lib/security/crypto";
import { maskIdentifier } from "@/lib/security/masking";
import type { IdentifierInput, ProfileInput } from "./validation";

export function encryptedProfileFields(id: string, input: ProfileInput) {
  return {
    displayName: input.displayName,
    countryCode: input.countryCode,
    region: input.region,
    residencyConfirmed: input.residencyConfirmed,
    legalNameEnc: encryptField(input.legalName, {
      table: "UserProfile",
      column: "legalNameEnc",
      recordId: id,
    }),
    legalNameBi: blindIndex(input.legalName, "profile:legalName", "text"),
    contactEmailEnc: encryptField(input.contactEmail, {
      table: "UserProfile",
      column: "contactEmailEnc",
      recordId: id,
    }),
    contactEmailBi: blindIndex(input.contactEmail, "profile:email", "email"),
    contactEmailMasked: maskIdentifier("EMAIL", input.contactEmail),
  };
}

export function identifierBlindIndex(input: Pick<IdentifierInput, "type" | "value">) {
  return blindIndex(
    input.value,
    `identifier:${input.type}`,
    input.type === "EMAIL" ? "email" : input.type === "PHONE" ? "phone" : "text"
  );
}

export function encryptedIdentifierFields(id: string, input: IdentifierInput) {
  return {
    type: input.type,
    label: input.label || null,
    isPrimary: input.isPrimary ?? false,
    valueEnc: encryptField(input.value, {
      table: "ProfileIdentifier",
      column: "valueEnc",
      recordId: id,
    }),
    valueBi: identifierBlindIndex(input),
    maskedPreview: maskIdentifier(input.type, input.value),
  };
}
