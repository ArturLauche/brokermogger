"use client";
import { useActionState } from "react";
import { FormFeedback } from "@/components/common/form-feedback";
import { ProfileFields } from "@/components/profiles/profile-fields";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/validation/actionResult";
import { saveProfileAction, type EditProfileFields } from "./actions";
export function EditProfileForm({
  initial,
  household,
}: {
  initial: EditProfileFields;
  household: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveProfileAction,
    initialActionState(initial)
  );
  return (
    <form action={action} className="space-y-5">
      <input name="profileId" type="hidden" value={initial.profileId} />
      <FormFeedback state={state} />
      <ProfileFields values={state.values} errors={state.fieldErrors} />
      <p className="border-t pt-4 text-sm text-muted-foreground">
        Changes to matching details require affected drafts to be regenerated and approved
        again.
        {household
          ? " Changing this adult’s name, contact address or residence also requires a new consent invitation."
          : ""}
      </p>
      <Button disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button>
    </form>
  );
}
