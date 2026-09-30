"use client";
import { useActionState } from "react";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { ProfileFields } from "@/components/profiles/profile-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { HOUSEHOLD_ADULT_CONFIRMATION } from "@/lib/household/copy";
import { initialActionState } from "@/lib/validation/actionResult";
import { inviteAdultAction, manageMemberAction, type InvitationFields } from "./actions";
export function InvitationForm() {
  const initial: InvitationFields = {
    displayName: "Household adult",
    legalName: "",
    contactEmail: "",
    countryCode: "DE",
    region: "",
    residencyConfirmed: "false",
    relationship: "OTHER_ADULT",
    adultConfirmed: "false",
  };
  const [state, action, pending] = useActionState(
    inviteAdultAction,
    initialActionState(initial)
  );
  return (
    <form action={action} className="max-w-2xl space-y-5 border-t pt-6">
      <h2 className="text-lg font-semibold">Invite an adult</h2>
      <p className="text-sm text-muted-foreground">
        Only invite someone who asked you to manage their requests. The contact email
        receives a consent link; no broker is contacted by this step.
      </p>
      <FormFeedback state={state} />
      <ProfileFields values={state.values} errors={state.fieldErrors} />
      <div className="space-y-2">
        <Label htmlFor="relationship">Relationship</Label>
        <select
          id="relationship"
          name="relationship"
          defaultValue={state.values.relationship}
          className="h-11 w-full rounded-md border border-input bg-background px-3 md:h-10"
          aria-describedby="relationship-hint relationship-error"
        >
          <option value="SPOUSE_OR_PARTNER">Spouse or partner</option>
          <option value="PARENT">Parent</option>
          <option value="ADULT_CHILD">Adult child</option>
          <option value="SIBLING">Sibling</option>
          <option value="OTHER_ADULT">Other adult</option>
        </select>
        <p id="relationship-hint" className="text-sm text-muted-foreground">
          Records your relationship to the adult whose requests you manage.
        </p>
        <FieldError id="relationship-error" message={state.fieldErrors.relationship} />
      </div>
      <div className="flex items-start gap-3">
        <input
          id="adultConfirmed"
          name="adultConfirmed"
          type="checkbox"
          value="true"
          required
          defaultChecked={state.values.adultConfirmed === "true"}
          className="mt-1 size-4 accent-primary"
          aria-describedby="adult-error"
        />
        <Label htmlFor="adultConfirmed" className="leading-6">
          {HOUSEHOLD_ADULT_CONFIRMATION}
        </Label>
      </div>
      <FieldError id="adult-error" message={state.fieldErrors.adultConfirmed} />
      <Button disabled={pending}>
        {pending ? "Creating invitation…" : "Save profile and send invitation"}
      </Button>
    </form>
  );
}
export function MemberActions({
  memberId,
  verified,
}: {
  memberId: string;
  verified: boolean;
}) {
  const [state, action, pending] = useActionState(
    manageMemberAction,
    initialActionState({ memberId })
  );
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="memberId" value={memberId} />
      <div className="flex flex-wrap gap-2">
        {!verified && (
          <Button name="intent" value="resend" variant="outline" disabled={pending}>
            {pending ? "Saving…" : "Send new invitation"}
          </Button>
        )}
        <Button name="intent" value="revoke" variant="outline" disabled={pending}>
          Withdraw permission
        </Button>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
