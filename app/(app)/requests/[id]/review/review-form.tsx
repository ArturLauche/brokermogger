"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { APPROVAL_CHECKBOX_LABEL } from "@/lib/requests/labels";

import { approveRequestAction } from "../../actions";

export function ReviewApprovalForm({
  requestId,
  envelopeHash,
  manual,
}: {
  requestId: string;
  envelopeHash: string;
  manual: boolean;
}) {
  const [checked, setChecked] = useState(false);
  const hintId = "approval-checkbox-hint";
  const label = APPROVAL_CHECKBOX_LABEL;

  return (
    <form
      action={approveRequestAction}
      className="flex max-w-prose flex-col items-start gap-4"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="envelopeHash" value={envelopeHash} />
      <div className="flex items-start gap-3">
        <input
          id="confirmationAccepted"
          name="confirmationAccepted"
          type="checkbox"
          className="mt-1.5 size-4 shrink-0 accent-primary"
          value="on"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          aria-describedby={hintId}
        />
        <Label
          htmlFor="confirmationAccepted"
          className="min-h-11 cursor-pointer items-start text-sm leading-6"
        >
          {label}
        </Label>
      </div>
      <p id={hintId} className="text-sm text-muted-foreground">
        Approval covers this exact text, destination, channel, reply address, and selected
        identifiers. Check the confirmation to enable approval.
      </p>
      <ApprovalButton checked={checked} manual={manual} hintId={hintId} />
    </form>
  );
}

function ApprovalButton({
  checked,
  manual,
  hintId,
}: {
  checked: boolean;
  manual: boolean;
  hintId: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={!checked || pending} aria-describedby={hintId}>
      {pending
        ? "Approving…"
        : manual
          ? "Approve for manual submission"
          : "Approve and queue for sending"}
    </Button>
  );
}
