"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/validation/actionResult";
import {
  changeReportJobAction,
  generateReportAction,
  type ReportFormValues,
} from "./actions";

export function ReportForm({
  initial,
  profiles,
  timeZone,
}: {
  initial: ReportFormValues;
  profiles: { id: string; displayName: string }[];
  timeZone: string;
}) {
  const [state, action, pending] = useActionState(
    generateReportAction,
    initialActionState(initial)
  );
  return (
    <form action={action} className="max-w-2xl space-y-5" aria-busy={pending}>
      <FormFeedback state={state} />
      <input type="hidden" name="submissionKey" value={state.values.submissionKey} />
      <div className="grid gap-4 sm:grid-cols-2">
        {(["dateFrom", "dateTo"] as const).map((name) => (
          <div className="space-y-2" key={name}>
            <Label htmlFor={name}>{name === "dateFrom" ? "From" : "To, inclusive"}</Label>
            <Input
              id={name}
              name={name}
              type="date"
              required
              defaultValue={state.values[name]}
              className="min-h-11"
              aria-invalid={Boolean(state.fieldErrors[name])}
              aria-describedby={`${name}-error report-dates-help`}
            />
            <FieldError id={`${name}-error`} message={state.fieldErrors[name]} />
          </div>
        ))}
      </div>
      <p id="report-dates-help" className="text-sm leading-6 text-muted-foreground">
        We use these dates to select requests by their creation date in {timeZone},
        including the entire final day. Choose up to 24 months. Each report records the
        status available during generation.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="report-profile">Profile</Label>
          <select
            id="report-profile"
            name="profileId"
            className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={state.values.profileId}
            aria-invalid={Boolean(state.fieldErrors.profileId)}
            aria-describedby="profileId-error report-profile-help"
          >
            <option value="">All profiles</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.displayName}
              </option>
            ))}
          </select>
          <FieldError id="profileId-error" message={state.fieldErrors.profileId} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="report-format">Format</Label>
          <select
            id="report-format"
            name="format"
            className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={state.values.format}
            aria-invalid={Boolean(state.fieldErrors.format)}
            aria-describedby="format-error"
          >
            <option value="JSON">JSON — structured data</option>
            <option value="PDF">PDF — readable document</option>
          </select>
          <FieldError id="format-error" message={state.fieldErrors.format} />
        </div>
      </div>
      <p id="report-profile-help" className="text-sm text-muted-foreground">
        The profile selection controls which requests appear. Letters, replies and
        unmasked identifiers are not included.
      </p>
      <Button disabled={pending}>
        {pending ? "Queuing report…" : "Generate report"}
      </Button>
    </form>
  );
}

export function ReportJobAction({
  id,
  operation,
}: {
  id: string;
  operation: "retry" | "cancel";
}) {
  const [state, action, pending] = useActionState(
    changeReportJobAction,
    initialActionState({ id, operation: String(operation) })
  );
  return (
    <form action={action} className="space-y-2" aria-busy={pending}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="operation" value={operation} />
      <Button variant="outline" disabled={pending}>
        {pending
          ? "Updating…"
          : operation === "retry"
            ? "Generate again"
            : "Cancel generation"}
      </Button>
      <FormFeedback state={state} />
    </form>
  );
}

/** Refresh only active work and visible tabs; stop automatically when results arrive. */
export function ReportRefresh({ working }: { working: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!working) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, 10_000);
    return () => clearInterval(interval);
  }, [working, router]);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
      >
        {pending ? "Refreshing…" : "Refresh status"}
      </Button>
      {working ? (
        <p className="text-sm text-muted-foreground">
          Status refreshes every 10 seconds. You can leave this page; a notification
          appears when the report is ready.
        </p>
      ) : null}
    </div>
  );
}
