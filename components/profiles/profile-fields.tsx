"use client";

import { FieldError } from "@/components/common/form-feedback";
import { LocationFields } from "@/components/common/location-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ProfileFields = {
  displayName: string;
  legalName: string;
  contactEmail: string;
  countryCode: string;
  region: string;
  residencyConfirmed: string;
};

export function ProfileFields({
  values,
  errors,
}: {
  values: ProfileFields;
  errors: Partial<Record<keyof ProfileFields, string>>;
}) {
  return (
    <>
      {(
        [
          [
            "displayName",
            "Profile label",
            "A label for your workspace, such as Personal profile. Keep the legal name in the encrypted field below.",
            80,
          ],
          [
            "legalName",
            "Full legal name",
            "Included in requests so brokers can match their records. Stored encrypted.",
            120,
          ],
          [
            "contactEmail",
            "Profile contact email",
            "Included in letters for record matching and contact. This does not change the account’s sign-in address.",
            254,
          ],
        ] as const
      ).map(([field, label, why, max]) => (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>{label}</Label>
          <Input
            id={field}
            name={field}
            required
            maxLength={max}
            type={field === "contactEmail" ? "email" : "text"}
            autoComplete={
              field === "legalName" ? "name" : field === "contactEmail" ? "email" : "off"
            }
            defaultValue={values[field]}
            aria-invalid={Boolean(errors[field])}
            aria-describedby={`${field}-hint ${field}-error`}
          />
          <p id={`${field}-hint`} className="text-sm text-muted-foreground">
            {why}
          </p>
          <FieldError id={`${field}-error`} message={errors[field]} />
        </div>
      ))}
      <LocationFields
        countryCode={values.countryCode}
        region={values.region}
        error={errors.region}
      />
      <div className="flex items-start gap-3">
        <input
          id="residencyConfirmed"
          name="residencyConfirmed"
          type="checkbox"
          value="true"
          required
          defaultChecked={values.residencyConfirmed === "true"}
          className="mt-1 size-4 accent-primary"
          aria-describedby="residency-error"
        />
        <Label htmlFor="residencyConfirmed" className="leading-6">
          This person lives in the selected country and state or region.
        </Label>
      </div>
      <FieldError id="residency-error" message={errors.residencyConfirmed} />
    </>
  );
}
