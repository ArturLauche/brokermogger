"use client";

import { useActionState } from "react";
import { FormFeedback } from "@/components/common/form-feedback";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/validation/actionResult";
import { NOTIFICATION_EMAIL_NOTICE } from "@/lib/notifications/copy";
import { savePreferencesAction, updateNotificationAction } from "./actions";

export function NotificationPreferencesForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [state, action, pending] = useActionState(
    savePreferencesAction,
    initialActionState({ emailEnabled: String(emailEnabled) })
  );
  return (
    <form action={action} className="max-w-2xl space-y-4" aria-busy={pending}>
      <FormFeedback state={state} />
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="emailEnabled"
          className="mt-1 size-4"
          defaultChecked={state.values.emailEnabled === "true"}
          aria-describedby="email-notification-notice"
        />
        <span>Email me when a new notification needs my attention</span>
      </label>
      <p
        id="email-notification-notice"
        className="text-sm leading-6 text-muted-foreground"
      >
        {NOTIFICATION_EMAIL_NOTICE}
      </p>
      <Button variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save notification preferences"}
      </Button>
    </form>
  );
}

export function NotificationActions({
  id,
  read,
  dismissed,
}: {
  id: string;
  read: boolean;
  dismissed: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateNotificationAction,
    initialActionState({ id, operation: "" })
  );
  return (
    <form action={action} className="space-y-3" aria-busy={pending}>
      <input type="hidden" name="id" value={id} />
      <FormFeedback state={state} />
      {pending ? (
        <p role="status" className="text-sm">
          Updating notification…
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {dismissed ? (
          <Button
            variant="outline"
            size="sm"
            name="operation"
            value="restore"
            disabled={pending}
          >
            Restore
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              name="operation"
              value={read ? "unread" : "read"}
              disabled={pending}
            >
              {read ? "Mark unread" : "Mark read"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              name="operation"
              value="dismiss"
              disabled={pending}
            >
              Dismiss
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
