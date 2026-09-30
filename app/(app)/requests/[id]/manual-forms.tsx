"use client";

import { useActionState } from "react";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/validation/actionResult";
import {
  submitManuallyAction,
  reconcileDeliveryAction,
  verificationAction,
  receiptAction,
  type SubmissionFields,
  type ReceiptFields,
} from "./manual-actions";

const selectClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring";

export function ReceiptForm({
  initial,
  submittedOn,
  today,
  timeZone,
}: {
  initial: ReceiptFields;
  submittedOn: string;
  today: string;
  timeZone: string;
}) {
  const [state, action, pending] = useActionState(
    receiptAction,
    initialActionState(initial)
  );
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4 py-3">
      <input type="hidden" name="requestId" value={initial.requestId} />
      <input type="hidden" name="previousAnchorOn" value={initial.previousAnchorOn} />
      <input type="hidden" name="previousBasis" value={initial.previousBasis} />
      <FormFeedback state={state} />
      <div className="space-y-2">
        <Label htmlFor="original-receipt">Original request receipt date</Label>
        <Input
          id="original-receipt"
          name="receivedOn"
          type="date"
          required
          min={submittedOn}
          max={today}
          defaultValue={state.values.receivedOn}
          aria-invalid={Boolean(state.fieldErrors.receivedOn)}
          aria-describedby="original-receipt-hint original-receipt-error"
        />
        <p id="original-receipt-hint" className="text-sm text-muted-foreground">
          Why we ask: a broker acknowledgement or postal receipt can replace a dispatch
          estimate. Use the original request’s receipt date, not a later follow-up.
          Reminder times use {timeZone}.
        </p>
        <FieldError id="original-receipt-error" message={state.fieldErrors.receivedOn} />
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          className="mt-1 size-4"
          type="checkbox"
          name="confirmationAccepted"
          required
          defaultChecked={state.values.confirmationAccepted === "on"}
          aria-invalid={Boolean(state.fieldErrors.confirmationAccepted)}
          aria-describedby="receipt-confirmation-error"
        />
        <span>I checked the receipt of the original request and confirm this date.</span>
      </label>
      <FieldError
        id="receipt-confirmation-error"
        message={state.fieldErrors.confirmationAccepted}
      />
      <Button className="self-start" disabled={pending}>
        {pending ? "Recording…" : "Record receipt date"}
      </Button>
    </form>
  );
}

export function ManualSubmissionForm({
  initial,
  today,
  approvedOn,
  timeZone,
  files,
  instructionsOnly = false,
}: {
  initial: SubmissionFields;
  today: string;
  approvedOn: string;
  timeZone: string;
  files: { id: string; label: string }[];
  instructionsOnly?: boolean;
}) {
  const [state, action, pending] = useActionState(
    submitManuallyAction,
    initialActionState(initial)
  );
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="requestId" value={initial.requestId} />
      <input type="hidden" name="snapshotId" value={initial.snapshotId} />
      <FormFeedback state={state} />
      <p className="text-sm text-muted-foreground">
        Record these dates after you submit the approved message yourself. Dates use{" "}
        {timeZone}. A recorded submission is not confirmation of removal.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="submittedOn">Submission date</Label>
          <Input
            id="submittedOn"
            name="submittedOn"
            type="date"
            required
            min={approvedOn}
            max={today}
            defaultValue={state.values.submittedOn}
            aria-invalid={Boolean(state.fieldErrors.submittedOn)}
            aria-describedby="submittedOn-hint submittedOn-error"
          />
          <p id="submittedOn-hint" className="text-sm text-muted-foreground">
            When you sent the letter or completed the portal.
          </p>
          <FieldError id="submittedOn-error" message={state.fieldErrors.submittedOn} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="receivedOn">Confirmed receipt date (optional)</Label>
          <Input
            id="receivedOn"
            name="receivedOn"
            type="date"
            min={approvedOn}
            max={today}
            defaultValue={state.values.receivedOn}
            aria-invalid={Boolean(state.fieldErrors.receivedOn)}
            aria-describedby="receivedOn-hint receivedOn-error"
          />
          <p id="receivedOn-hint" className="text-sm text-muted-foreground">
            Use a postal receipt or broker acknowledgement. Leave blank if unknown.
          </p>
          <FieldError id="receivedOn-error" message={state.fieldErrors.receivedOn} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="evidenceFileId">Submission evidence (optional)</Label>
        <select
          className={selectClass}
          id="evidenceFileId"
          name="evidenceFileId"
          defaultValue={state.values.evidenceFileId}
          aria-describedby="evidenceFileId-hint evidenceFileId-error"
        >
          <option value="">No file attached</option>
          {files.map((file) => (
            <option key={file.id} value={file.id}>
              {file.label}
            </option>
          ))}
        </select>
        <p id="evidenceFileId-hint" className="text-sm text-muted-foreground">
          Attach an uploaded receipt or screenshot for this request. Identity documents
          are not submission evidence.
        </p>
        <FieldError
          id="evidenceFileId-error"
          message={state.fieldErrors.evidenceFileId}
        />
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          className="mt-1 size-4"
          type="checkbox"
          name="confirmationAccepted"
          required
        />
        <span>
          {instructionsOnly
            ? "I followed these approved instructions and personally submitted the platform request for this broker. These dates are accurate."
            : "I submitted this exact approved message myself, and these dates are accurate."}
        </span>
      </label>
      <Button className="self-start" disabled={pending}>
        {pending ? "Recording…" : "Record submission"}
      </Button>
    </form>
  );
}

export function ReconciliationForm({
  requestId,
  outboundEmailId,
}: {
  requestId: string;
  outboundEmailId: string;
}) {
  const [state, action, pending] = useActionState(
    reconcileDeliveryAction,
    initialActionState({ requestId, outboundEmailId, outcome: "", providerMessageId: "" })
  );
  const prefix = `delivery-${outboundEmailId}`;
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="outboundEmailId" value={outboundEmailId} />
      <FormFeedback state={state} />
      <p className="text-sm text-muted-foreground">
        Check the instance’s email provider records, or ask its operator to check. Keep
        this unresolved if the outcome is unknown. An accepted message cannot be recalled.
      </p>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-outcome`}>Verified outcome</Label>
        <select
          id={`${prefix}-outcome`}
          name="outcome"
          className={selectClass}
          required
          defaultValue={state.values.outcome}
          aria-describedby={`${prefix}-error`}
        >
          <option value="" disabled>
            Select the outcome you verified
          </option>
          <option value="accepted">The provider accepted the message</option>
          <option value="not_sent">The provider did not accept the message</option>
        </select>
        <FieldError id={`${prefix}-error`} message={state.fieldErrors.outcome} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-provider`}>Provider message ID (optional)</Label>
        <Input
          id={`${prefix}-provider`}
          name="providerMessageId"
          maxLength={200}
          defaultValue={state.values.providerMessageId}
          aria-describedby={`${prefix}-provider-hint ${prefix}-provider-error`}
        />
        <p id={`${prefix}-provider-hint`} className="text-sm text-muted-foreground">
          An ID from the provider’s record helps match later delivery updates.
        </p>
        <FieldError
          id={`${prefix}-provider-error`}
          message={state.fieldErrors.providerMessageId}
        />
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          className="mt-1 size-4"
          type="checkbox"
          name="confirmationAccepted"
          required
        />
        <span>I checked the provider’s records and confirm this outcome.</span>
      </label>
      <Button className="self-start" disabled={pending}>
        {pending ? "Saving…" : "Record delivery outcome"}
      </Button>
    </form>
  );
}

export function VerificationForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(
    verificationAction,
    initialActionState({ requestId, outcome: "" })
  );
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="requestId" value={requestId} />
      <FormFeedback state={state} />
      <p className="text-sm text-muted-foreground">
        Verify the broker’s instructions independently. You can provide the minimum
        required information directly or decline. Uploading evidence here never sends it
        to the broker.
      </p>
      <div className="space-y-2">
        <Label htmlFor="verification-outcome">Your decision</Label>
        <select
          className={selectClass}
          id="verification-outcome"
          name="outcome"
          required
          defaultValue={state.values.outcome}
          aria-describedby="verification-error"
        >
          <option value="" disabled>
            Select a decision
          </option>
          <option value="provided">I provided verification directly to the broker</option>
          <option value="declined">I decline to provide verification</option>
        </select>
        <FieldError id="verification-error" message={state.fieldErrors.outcome} />
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          className="mt-1 size-4"
          type="checkbox"
          name="confirmationAccepted"
          required
        />
        <span>
          I confirm this decision. No verification will be sent by this instance.
        </span>
      </label>
      <Button className="self-start" disabled={pending}>
        {pending ? "Saving…" : "Record verification decision"}
      </Button>
    </form>
  );
}
