"use client";

import { MaskedValue } from "@/components/common/masked-value";

import { revealIdentifierAction } from "./actions";

export function VaultMaskedIdentifier({
  identifierId,
  maskedValue,
  label,
}: {
  identifierId: string;
  maskedValue: string;
  label: string;
}) {
  return (
    <MaskedValue
      maskedValue={maskedValue}
      label={label}
      loadValue={() => revealIdentifierAction(identifierId)}
    />
  );
}
