"use client";
import { useActionState, useState } from "react";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/validation/actionResult";
import { SENSITIVE_EXPORT_NOTICE } from "@/lib/exports/notices";
import { createExportAction, deleteExportAction } from "./actions";

export function ExportForm({ submissionKey }: { submissionKey: string }) {
  const [state, action, pending] = useActionState(
    createExportAction,
    initialActionState({ mode: "MASKED", confirmationAccepted: "false", submissionKey })
  );
  const [mode, setMode] = useState("MASKED");
  const [accepted, setAccepted] = useState(false);
  return (
    <form action={action} aria-busy={pending} className="max-w-2xl space-y-5">
      <FormFeedback state={state} />
      <input type="hidden" name="submissionKey" value={state.values.submissionKey} />
      <fieldset
        disabled={pending}
        className="space-y-3"
        aria-describedby="export-choice-help mode-error"
      >
        <legend className="mb-3 font-medium">Choose what to include</legend>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="radio"
            name="mode"
            value="MASKED"
            checked={mode === "MASKED"}
            onChange={() => {
              setMode("MASKED");
              setAccepted(false);
            }}
            className="mt-1 size-4"
          />
          <span>
            <span className="font-medium">Masked account export</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              Your account history, masked identifiers, consent proof and record details.
              Full letters, replies and private payloads are omitted.
            </span>
          </span>
        </label>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="radio"
            name="mode"
            value="SENSITIVE"
            checked={mode === "SENSITIVE"}
            onChange={() => {
              setMode("SENSITIVE");
              setAccepted(false);
            }}
            className="mt-1 size-4"
          />
          <span>
            <span className="font-medium">Sensitive account export</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              Also includes unmasked personal details, stored letters, replies and private
              correspondence metadata.
            </span>
          </span>
        </label>
        <FieldError id="mode-error" message={state.fieldErrors.mode} />
      </fieldset>
      <p id="export-choice-help" className="text-sm leading-6 text-muted-foreground">
        Both exports are JSON files. Original files are downloaded separately from
        Evidence; available private download paths are included. Choose a masked copy
        unless you need the full text.
      </p>
      {mode === "SENSITIVE" ? (
        <div className="space-y-3 border-y py-4">
          <p id="sensitive-export-notice" className="text-sm leading-6">
            {SENSITIVE_EXPORT_NOTICE}
          </p>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="confirmationAccepted"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              disabled={pending}
              className="mt-1 size-4"
              aria-describedby="sensitive-export-notice confirmationAccepted-error"
              aria-invalid={Boolean(state.fieldErrors.confirmationAccepted)}
            />
            <span>
              I confirm that I want an export containing unmasked personal data.
            </span>
          </label>
          <FieldError
            id="confirmationAccepted-error"
            message={state.fieldErrors.confirmationAccepted}
          />
        </div>
      ) : null}
      <Button disabled={pending}>{pending ? "Queuing export…" : "Create export"}</Button>
    </form>
  );
}
export function DeleteExportForm({ id, working }: { id: string; working: boolean }) {
  const [state, action, pending] = useActionState(
    deleteExportAction,
    initialActionState({ id })
  );
  return (
    <form action={action} aria-busy={pending} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <FormFeedback state={state} />
      <Button variant="outline" disabled={pending}>
        {pending ? "Removing…" : working ? "Cancel and remove" : "Delete copy"}
      </Button>
    </form>
  );
}
