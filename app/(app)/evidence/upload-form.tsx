"use client";

import { useActionState, useTransition } from "react";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/validation/actionResult";
import { uploadEvidenceAction, type EvidenceUploadFields } from "./actions";

export function EvidenceUploadForm({
  requestId,
  requests,
}: {
  requestId: string;
  requests: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(
    uploadEvidenceAction,
    initialActionState<EvidenceUploadFields>({
      kind: "SCREENSHOT",
      requestId,
      identityConsent: "false",
      file: "",
    })
  );
  const [, startTransition] = useTransition();
  return (
    <form
      action={action}
      aria-busy={pending}
      className="max-w-[680px] space-y-5"
      onSubmit={(event) => {
        // Keep the selected file and other controls intact when validation fails.
        // Native action submission would reset an uncontrolled file input.
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(() => action(form));
      }}
    >
      <FormFeedback state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="kind">Kind</Label>
          <select
            id="kind"
            name="kind"
            defaultValue={state.values.kind}
            disabled={pending}
            aria-invalid={Boolean(state.fieldErrors.kind)}
            aria-describedby="kind-hint kind-error"
            className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm md:h-10"
          >
            <option value="SCREENSHOT">Screenshot</option>
            <option value="BROKER_RESPONSE">Broker response</option>
            <option value="IDENTITY_DOCUMENT">Identity document</option>
            <option value="OTHER">Other</option>
          </select>
          <p id="kind-hint" className="text-sm leading-6 text-muted-foreground">
            Used to organize your evidence. Files are never submitted automatically.
          </p>
          <FieldError id="kind-error" message={state.fieldErrors.kind} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="requestId">Request (optional)</Label>
          <select
            id="requestId"
            name="requestId"
            defaultValue={state.values.requestId}
            disabled={pending}
            aria-invalid={Boolean(state.fieldErrors.requestId)}
            aria-describedby="requestId-hint requestId-error"
            className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm md:h-10"
          >
            <option value="">No linked request</option>
            {requests.map((request) => (
              <option key={request.id} value={request.id}>
                {request.label}
              </option>
            ))}
          </select>
          <p id="requestId-hint" className="text-sm leading-6 text-muted-foreground">
            Links the file to its request. Identity documents require a specific recorded
            verification request.
          </p>
          <FieldError id="requestId-error" message={state.fieldErrors.requestId} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="file">File</Label>
        <Input
          id="file"
          name="file"
          type="file"
          required
          accept="image/png,image/jpeg,application/pdf"
          disabled={pending}
          aria-invalid={Boolean(state.fieldErrors.file)}
          aria-describedby="file-hint file-error"
        />
        <p id="file-hint" className="text-sm leading-6 text-muted-foreground">
          A screenshot or reply can document what happened. PNG, JPEG, or PDF, up to 8 MB.
          Remove unrelated personal details before uploading.
        </p>
        <FieldError id="file-error" message={state.fieldErrors.file} />
      </div>
      <details className="border-y py-3">
        <summary className="cursor-pointer py-2 text-sm font-medium">
          Optional identity documents
        </summary>
        <div className="space-y-4 py-3">
          <p className="text-sm leading-6 text-muted-foreground">
            Only store one after the broker has requested identity proof and you have
            recorded that reply. Redact unrelated details. Storage is encrypted and
            temporary; expiry follows this instance’s policy. You can decline verification
            instead.
          </p>
          <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              name="identityConsent"
              defaultChecked={state.values.identityConsent === "true"}
              disabled={pending}
              className="mt-1.5 size-4 shrink-0"
            />
            <span>
              I consent to temporary encrypted storage of this optional identity document
              after a recorded broker verification request. I will handle any external
              submission myself.
            </span>
          </label>
        </div>
      </details>
      <Button type="submit" disabled={pending}>
        {pending ? "Storing file…" : "Store file"}
      </Button>
    </form>
  );
}
