"use client";
import { useActionState } from "react";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/validation/actionResult";
import { updateAccountAction, type AccountFields } from "./actions";
export function AccountForm({
  initial,
  maskedEmail,
}: {
  initial: AccountFields;
  maskedEmail: string;
}) {
  const [state, action, pending] = useActionState(
    updateAccountAction,
    initialActionState(initial)
  );
  return (
    <form action={action} className="space-y-5">
      <FormFeedback state={state} />
      <div className="space-y-2">
        <Label htmlFor="name">Display name (optional)</Label>
        <Input
          id="name"
          name="name"
          maxLength={80}
          defaultValue={state.values.name}
          aria-describedby="name-hint name-error"
          aria-invalid={Boolean(state.fieldErrors.name)}
        />
        <p id="name-hint" className="text-sm text-muted-foreground">
          A workspace label. Use a nickname; legal names belong in your encrypted profile.
        </p>
        <FieldError id="name-error" message={state.fieldErrors.name} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Sign-in email</p>
        <p className="font-mono text-sm [overflow-wrap:anywhere]">{maskedEmail}</p>
        <p className="text-sm text-muted-foreground">
          This is the address used for magic-link authentication.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input
          id="timezone"
          name="timezone"
          required
          maxLength={80}
          defaultValue={state.values.timezone}
          list="common-timezones"
          aria-describedby="timezone-hint timezone-error"
          aria-invalid={Boolean(state.fieldErrors.timezone)}
        />
        <datalist id="common-timezones">
          {[
            "UTC",
            "Europe/Berlin",
            "Europe/London",
            "America/New_York",
            "America/Chicago",
            "America/Denver",
            "America/Los_Angeles",
            "Asia/Singapore",
            "Australia/Sydney",
          ].map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        <p id="timezone-hint" className="text-sm text-muted-foreground">
          Used to display events and times. Enter an IANA timezone, such as Europe/Berlin
          or America/New_York.
        </p>
        <FieldError id="timezone-error" message={state.fieldErrors.timezone} />
      </div>
      <Button disabled={pending}>{pending ? "Saving…" : "Save account"}</Button>
    </form>
  );
}
