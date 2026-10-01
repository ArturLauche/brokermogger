"use client";
import { useActionState } from "react";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IDENTIFIER_TYPE_LABELS } from "@/lib/requests/labels";
import { initialActionState } from "@/lib/validation/actionResult";
import { saveIdentifierAction, type IdentifierFields } from "./actions";
export function IdentifierForm({
  initial,
  address = false,
}: {
  initial: IdentifierFields;
  address?: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveIdentifierAction,
    initialActionState(initial)
  );
  const editing = Boolean(initial.identifierId);
  return (
    <form action={action} className="max-w-2xl space-y-4 border-t pt-6">
      <input type="hidden" name="profileId" value={initial.profileId} />
      <input type="hidden" name="identifierId" value={initial.identifierId} />
      {!editing && (
        <h2 className="text-lg font-semibold">
          {address ? "Add an address" : "Add an identifier"}
        </h2>
      )}
      <FormFeedback state={state} />
      <div className="space-y-2">
        <Label htmlFor="identifier-type">Type</Label>
        <select
          id="identifier-type"
          name="type"
          defaultValue={state.values.type}
          className="h-11 w-full rounded-md border border-input bg-background px-3 md:h-10"
          aria-describedby="identifier-type-error"
        >
          {Object.entries(IDENTIFIER_TYPE_LABELS)
            .filter(
              ([type]) =>
                editing ||
                (address
                  ? ["POSTAL_ADDRESS", "PREVIOUS_ADDRESS"].includes(type)
                  : !["FULL_NAME", "POSTAL_ADDRESS", "PREVIOUS_ADDRESS"].includes(type))
            )
            .map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
        </select>
        <FieldError id="identifier-type-error" message={state.fieldErrors.type} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="identifier-value">Value</Label>
        <Input
          id="identifier-value"
          name="value"
          required
          maxLength={200}
          defaultValue={state.values.value}
          aria-invalid={Boolean(state.fieldErrors.value)}
          aria-describedby="identifier-value-hint identifier-value-error"
        />
        <p id="identifier-value-hint" className="text-sm text-muted-foreground">
          Used to help a broker match records. Stored encrypted; included only when you
          select it for a request. Do not include dates of birth, identity document
          numbers, financial data or children’s information.
        </p>
        <FieldError id="identifier-value-error" message={state.fieldErrors.value} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="identifier-label">Label (optional)</Label>
        <Input
          id="identifier-label"
          name="label"
          maxLength={80}
          defaultValue={state.values.label}
          aria-describedby="identifier-label-hint identifier-label-error"
        />
        <p id="identifier-label-hint" className="text-sm text-muted-foreground">
          A description for your workspace, such as Previous email. Keep the sensitive
          value in the encrypted field above.
        </p>
        <FieldError id="identifier-label-error" message={state.fieldErrors.label} />
      </div>
      <Button disabled={pending}>
        {pending ? "Saving…" : editing ? "Save identifier" : "Add identifier"}
      </Button>
    </form>
  );
}
