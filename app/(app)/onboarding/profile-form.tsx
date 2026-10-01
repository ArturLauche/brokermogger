"use client";

import { useActionState } from "react";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { ProfileFields } from "@/components/profiles/profile-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/validation/actionResult";
import {
  MAX_ONBOARDING_IDENTIFIERS,
  MAX_ONBOARDING_IDENTIFIER_TEXT_LENGTH,
} from "@/lib/profiles/limits";
import { saveOnboarding, type OnboardingFields } from "./actions";

export function OnboardingForm({ initial }: { initial: OnboardingFields }) {
  const [state, action, pending] = useActionState(
    saveOnboarding,
    initialActionState(initial)
  );
  return (
    <form action={action} className="flex flex-col gap-8">
      <input name="profileId" type="hidden" value={state.values.profileId} />
      <FormFeedback state={state} />
      <section className="space-y-5">
        <h2 className="text-lg font-semibold">Profile details</h2>
        <ProfileFields values={state.values} errors={state.fieldErrors} />
      </section>
      <section className="space-y-5 border-t pt-6">
        <h2 className="text-lg font-semibold">Additional matching details</h2>
        <p className="text-sm text-muted-foreground">
          Optional. Add one value per line, up to {MAX_ONBOARDING_IDENTIFIERS} distinct
          details per save. Saved values remain in your data vault, where you can edit or
          delete them.
        </p>
        {(
          [
            [
              "previousNames",
              "Previous names",
              "Helps match records under a former name.",
            ],
            [
              "extraEmails",
              "Other email addresses",
              "Helps match records associated with another address.",
            ],
            [
              "phones",
              "Phone numbers",
              "Helps match people-search records. Include a country code if known.",
            ],
            [
              "location",
              "Approximate location",
              "City or region only, to distinguish people with similar names.",
            ],
          ] as const
        ).map(([field, label, why]) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={field}>{label}</Label>
            <Textarea
              key={`${field}-${state.status}`}
              id={field}
              name={field}
              rows={2}
              maxLength={MAX_ONBOARDING_IDENTIFIER_TEXT_LENGTH}
              defaultValue={state.values[field]}
              aria-invalid={Boolean(state.fieldErrors[field])}
              aria-describedby={`${field}-hint ${field}-error`}
            />
            <p id={`${field}-hint`} className="text-sm text-muted-foreground">
              {why}
            </p>
            <FieldError id={`${field}-error`} message={state.fieldErrors[field]} />
          </div>
        ))}
      </section>
      <section className="space-y-4 border-t pt-6">
        <h2 className="text-lg font-semibold">Review and save</h2>
        <p className="text-sm text-muted-foreground">
          Postal addresses can be added later when a broker needs them. Identity documents
          are optional and only available after a recorded broker verification request.
          You control what is included in each letter and approve it before submission.
          Brokermogger is not a law firm and cannot guarantee removal.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button name="intent" value="complete" disabled={pending}>
            {pending ? "Saving…" : "Finish setup"}
          </Button>
          <Button name="intent" value="save" variant="outline" disabled={pending}>
            Save and finish later
          </Button>
        </div>
      </section>
    </form>
  );
}
