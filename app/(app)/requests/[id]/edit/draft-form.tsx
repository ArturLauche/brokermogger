"use client";

import { useActionState } from "react";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/validation/actionResult";
import { saveDraftAction, type DraftFields } from "./actions";

export function DraftForm({
  initial,
  canRegenerate,
}: {
  initial: DraftFields;
  canRegenerate: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveDraftAction,
    initialActionState(initial)
  );
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="requestId" value={initial.requestId} />
      <input type="hidden" name="previousSnapshotId" value={initial.previousSnapshotId} />
      <FormFeedback state={state} />
      <div className="space-y-2">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          name="subject"
          required
          maxLength={200}
          defaultValue={state.values.subject}
          aria-invalid={Boolean(state.fieldErrors.subject)}
          aria-describedby="subject-error"
        />
        <FieldError id="subject-error" message={state.fieldErrors.subject} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="body">Request letter</Label>
        <Textarea
          id="body"
          name="body"
          required
          maxLength={100_000}
          rows={20}
          defaultValue={state.values.body}
          className="text-base leading-7"
          aria-invalid={Boolean(state.fieldErrors.body)}
          aria-describedby="body-hint body-error"
        />
        <p id="body-hint" className="text-sm text-muted-foreground">
          Use plain text. Include only the details this broker needs. Saving creates a new
          snapshot that you must review and approve.
        </p>
        <FieldError id="body-error" message={state.fieldErrors.body} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button name="intent" value="save" disabled={pending}>
          {pending ? "Saving…" : "Save and review"}
        </Button>
        {canRegenerate ? (
          <Button
            name="intent"
            value="regenerate"
            variant="outline"
            disabled={pending}
            formNoValidate
            aria-describedby="regenerate-hint"
          >
            Regenerate from profile
          </Button>
        ) : null}
      </div>
      {canRegenerate ? (
        <p id="regenerate-hint" className="text-sm text-muted-foreground">
          Regenerating replaces these edits with current profile, broker and published
          template information. Earlier snapshots remain in the request history.
        </p>
      ) : null}
    </form>
  );
}
