"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { APPROVAL_CHECKBOX_LABEL } from "@/lib/requests/labels";

import { approveRequestAction } from "../../actions";

export function ReviewApprovalForm({
  requestId,
  contentHash,
}: {
  requestId: string;
  contentHash: string;
}) {
  const [checked, setChecked] = useState(false);
  const hintId = "approval-checkbox-hint";
  const label = APPROVAL_CHECKBOX_LABEL;

  return (
    <form action={approveRequestAction} className="flex flex-col gap-4">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="contentHash" value={contentHash} />
      <div className="flex items-start gap-2">
        <input
          id="confirmationAccepted"
          name="confirmationAccepted"
          type="checkbox"
          value="on"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          aria-describedby={hintId}
        />
        <Label htmlFor="confirmationAccepted" className="text-sm leading-5">
          {label}
        </Label>
      </div>
      <p id={hintId} className="text-sm text-muted-foreground">
        The approve button stays disabled until this confirmation is checked.
      </p>
      <Button type="submit" disabled={!checked} aria-describedby={hintId}>
        Approve and queue for sending
      </Button>
    </form>
  );
}
