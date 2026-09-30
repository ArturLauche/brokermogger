"use client";

import { useActionState, useState } from "react";
import type { BrokerResponseClassification, RequestStatus } from "@prisma/client";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { REQUEST_STATUS_LABELS } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EvidencePicker } from "@/components/common/evidence-picker";
import { Textarea } from "@/components/ui/textarea";
import { RESPONSE_LABELS, RESPONSE_STATUS } from "@/lib/responses/labels";
import { initialActionState } from "@/lib/validation/actionResult";
import {
  confirmResponseAction,
  linkResponseAction,
  recordResponseAction,
  type RecordResponseFields,
  type ConfirmResponseFields,
  type LinkResponseFields,
} from "./actions";

const selectClass =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring";

export function RecordResponseForm({
  initial,
  today,
  timeZone,
}: {
  initial: RecordResponseFields;
  today: string;
  timeZone: string;
}) {
  const [state, action, pending] = useActionState(
    recordResponseAction,
    initialActionState(initial)
  );
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="requestId" value={initial.requestId} />
      <input type="hidden" name="submissionKey" value={initial.submissionKey} />
      <FormFeedback state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="receivedOn">Received date</Label>
          <Input
            type="date"
            id="receivedOn"
            name="receivedOn"
            max={today}
            required
            defaultValue={state.values.receivedOn}
            aria-describedby="receivedOn-hint receivedOn-error"
            aria-invalid={Boolean(state.fieldErrors.receivedOn)}
          />
          <p id="receivedOn-hint" className="text-sm text-muted-foreground">
            When the reply arrived, in {timeZone}.
          </p>
          <FieldError id="receivedOn-error" message={state.fieldErrors.receivedOn} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="channel">Reply channel</Label>
          <select
            id="channel"
            name="channel"
            className={selectClass}
            defaultValue={state.values.channel}
          >
            <option value="EMAIL">Email</option>
            <option value="WEB_FORM">Web form or portal</option>
            <option value="POSTAL">Post</option>
            <option value="API">Published API</option>
            <option value="DROP">DROP platform</option>
          </select>
          <p className="text-sm text-muted-foreground">
            Where you received the response.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="fromAddress">Sender (optional)</Label>
        <Input
          id="fromAddress"
          name="fromAddress"
          maxLength={1000}
          defaultValue={state.values.fromAddress}
          aria-describedby="fromAddress-hint fromAddress-error"
        />
        <p id="fromAddress-hint" className="text-sm text-muted-foreground">
          The reply address or named sender helps you recognise the correspondence. Stored
          encrypted.
        </p>
        <FieldError id="fromAddress-error" message={state.fieldErrors.fromAddress} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="subject">Reply subject or label</Label>
        <Input
          id="subject"
          name="subject"
          required
          maxLength={1000}
          defaultValue={state.values.subject}
          aria-invalid={Boolean(state.fieldErrors.subject)}
          aria-describedby="subject-error"
        />
        <FieldError id="subject-error" message={state.fieldErrors.subject} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="body">Reply text</Label>
        <Textarea
          id="body"
          name="body"
          rows={12}
          maxLength={100_000}
          defaultValue={state.values.body}
          className="text-base leading-7"
          aria-invalid={Boolean(state.fieldErrors.body)}
          aria-describedby="body-hint body-error"
        />
        <p id="body-hint" className="text-sm text-muted-foreground">
          Paste the relevant text, or attach a file below. Exclude unrelated personal
          information. The content is stored encrypted and will not be sent anywhere.
        </p>
        <FieldError id="body-error" message={state.fieldErrors.body} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="evidenceFileId">Reply evidence (optional)</Label>
        <EvidencePicker
          requestId={initial.requestId}
          id="evidenceFileId"
          name="evidenceFileId"
          initialValue={state.values.evidenceFileId}
          describedBy="evidenceFileId-hint evidenceFileId-error"
        />
        <p id="evidenceFileId-hint" className="text-sm text-muted-foreground">
          A previously uploaded file for this request. Identity documents are excluded.
        </p>
        <FieldError
          id="evidenceFileId-error"
          message={state.fieldErrors.evidenceFileId}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Saving does not change the request status. You will review and confirm the reply’s
        meaning next.
      </p>
      <Button className="self-start" disabled={pending}>
        {pending ? "Saving…" : "Save reply and review"}
      </Button>
    </form>
  );
}

export function ConfirmResponseForm({
  initial,
  requestStatus,
  submitted,
  hasContent,
}: {
  initial: ConfirmResponseFields;
  requestStatus: RequestStatus | null;
  submitted: boolean;
  hasContent: boolean;
}) {
  const [state, action, pending] = useActionState(
    confirmResponseAction,
    initialActionState(initial)
  );
  const [classification, setClassification] = useState(
    initial.classification as BrokerResponseClassification
  );
  const [effect, setEffect] = useState("keep");
  const target = RESPONSE_STATUS[classification];
  const canApply = Boolean(
    target && requestStatus && requestStatus !== "CLOSED" && submitted && hasContent
  );
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="responseId" value={initial.responseId} />
      <input type="hidden" name="expectedRevision" value={initial.expectedRevision} />
      <input
        type="hidden"
        name="expectedRequestStatus"
        value={initial.expectedRequestStatus}
      />
      <FormFeedback state={state} />
      <div className="space-y-2">
        <Label htmlFor="classification">What does this reply say?</Label>
        <select
          id="classification"
          name="classification"
          className={selectClass}
          value={classification}
          onChange={(event) => {
            setClassification(event.target.value as BrokerResponseClassification);
            setEffect("keep");
          }}
          aria-describedby="classification-hint classification-error"
        >
          {Object.entries(RESPONSE_LABELS).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <p id="classification-hint" className="text-sm text-muted-foreground">
          Any suggestion uses simple local text matching. Check the full reply yourself.
          Reported completion does not guarantee removal.
        </p>
        <FieldError
          id="classification-error"
          message={state.fieldErrors.classification}
        />
      </div>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Request status</legend>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="radio"
            name="effect"
            value="keep"
            checked={effect === "keep"}
            onChange={() => setEffect("keep")}
            className="mt-1 size-4"
          />
          <span>
            Record the classification and keep the current request status
            {requestStatus ? ` (${REQUEST_STATUS_LABELS[requestStatus]})` : ""}.
          </span>
        </label>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="radio"
            name="effect"
            value="apply"
            checked={effect === "apply"}
            onChange={() => setEffect("apply")}
            disabled={!canApply}
            className="mt-1 size-4"
            aria-describedby="status-effect-hint"
          />
          <span>
            {target
              ? `Change the request status to ${REQUEST_STATUS_LABELS[target]}.`
              : "This classification does not change request status."}
          </span>
        </label>
        <p id="status-effect-hint" className="text-sm text-muted-foreground">
          {!requestStatus
            ? "Assign the reply to a request before changing its status."
            : !submitted
              ? "Record submission or resolve uncertain delivery first."
              : !hasContent
                ? "The full reply was not imported. Record its text or evidence manually before applying an outcome."
                : requestStatus === "CLOSED"
                  ? "Closed requests keep their status."
                  : "Applying a broker outcome cancels queued sends and follow-ups. An email already accepted cannot be recalled."}
        </p>
      </fieldset>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="confirmationAccepted"
          className="mt-1 size-4"
          required
        />
        <span>
          I reviewed the reply and confirm this classification and the selected status
          action.
        </span>
      </label>
      <Button className="self-start" disabled={pending}>
        {pending ? "Saving…" : "Confirm response"}
      </Button>
    </form>
  );
}

export function LinkResponseForm({
  initial,
  requests,
}: {
  initial: LinkResponseFields;
  requests: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(
    linkResponseAction,
    initialActionState(initial)
  );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="responseId" value={initial.responseId} />
      <input type="hidden" name="expectedRevision" value={initial.expectedRevision} />
      <FormFeedback state={state} />
      <div className="space-y-2">
        <Label htmlFor="requestId">Your request</Label>
        <select
          className={selectClass}
          id="requestId"
          name="requestId"
          defaultValue={state.values.requestId}
          required
          aria-describedby="requestId-error"
        >
          <option value="">Select a request after reviewing this reply</option>
          {requests.map((request) => (
            <option key={request.id} value={request.id}>
              {request.label}
            </option>
          ))}
        </select>
        <FieldError id="requestId-error" message={state.fieldErrors.requestId} />
      </div>
      <Button disabled={pending || requests.length === 0}>
        {pending ? "Assigning…" : "Assign to request"}
      </Button>
    </form>
  );
}
