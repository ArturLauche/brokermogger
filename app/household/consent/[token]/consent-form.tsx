"use client";
import { useActionState } from "react";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/validation/actionResult";
import { decideConsentAction } from "./actions";
export function ConsentForm({
  token,
  withdraw = false,
}: {
  token: string;
  withdraw?: boolean;
}) {
  const [state, action, pending] = useActionState(
    decideConsentAction,
    initialActionState({ token, adultConfirmed: "false", residencyConfirmed: "false" })
  );
  return (
    <form action={action} className="space-y-5">
      <input name="token" type="hidden" value={token} />
      <FormFeedback state={state} />
      {!withdraw && (
        <>
          <div className="flex items-start gap-3">
            <input
              id="adult"
              name="adultConfirmed"
              type="checkbox"
              value="true"
              required
              defaultChecked={state.values.adultConfirmed === "true"}
              className="mt-1 size-4 accent-primary"
              aria-describedby="adult-error"
            />
            <Label htmlFor="adult" className="leading-6">
              I am an adult and this invitation is for me.
            </Label>
          </div>
          <FieldError id="adult-error" message={state.fieldErrors.adultConfirmed} />
          <div className="flex items-start gap-3">
            <input
              id="residency"
              name="residencyConfirmed"
              type="checkbox"
              value="true"
              required
              defaultChecked={state.values.residencyConfirmed === "true"}
              className="mt-1 size-4 accent-primary"
            />
            <Label htmlFor="residency" className="leading-6">
              The displayed country and state or region are where I live.
            </Label>
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-3">
        {withdraw ? (
          <Button name="decision" value="revoke" variant="outline" disabled={pending}>
            {pending ? "Withdrawing…" : "Withdraw my permission"}
          </Button>
        ) : (
          <>
            <Button name="decision" value="agree" disabled={pending}>
              {pending ? "Saving…" : "I agree"}
            </Button>
            <Button
              name="decision"
              value="decline"
              variant="outline"
              formNoValidate
              disabled={pending}
            >
              I decline
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
