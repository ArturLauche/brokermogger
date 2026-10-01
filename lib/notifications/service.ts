import { env } from "@/lib/config/env";
import { recordAudit } from "@/lib/audit/service";
import { updateNotificationPreferences } from "@/lib/db/repositories/notifications";
import {
  beginNotificationEmail,
  finishNotificationEmail,
} from "@/lib/db/repositories/notificationDispatch";
import { getEmailProvider } from "@/lib/email";
import type { ClaimedJob } from "@/lib/jobs/types";
import type { ActorContext } from "@/lib/permissions/actor";

export async function saveNotificationPreferences(actor: ActorContext, input: unknown) {
  const result = await updateNotificationPreferences(actor, input);
  await recordAudit({
    actor,
    action: "account.notification_preferences_updated",
    resourceType: "user",
    resourceId: actor.userId,
    metadata: { emailEnabled: result.emailEnabled, noticeVersion: 1 },
  });
  return result;
}

export async function dispatchNotificationEmail(
  job: ClaimedJob<"DISPATCH_NOTIFICATION">
) {
  const prepared = await beginNotificationEmail(job);
  if (!prepared)
    return {
      message:
        "Notification email is no longer eligible. The in-app update remains available.",
    };
  try {
    const result = await getEmailProvider().sendNotificationEmail({
      to: { address: prepared.address },
      notificationId: prepared.id,
      subject: "An update is waiting in Brokermogger",
      text: `Open your notification inbox to review an update:\n\n${new URL("/notifications", env.APP_BASE_URL).href}\n\nThis reminder contains no broker names, profile details or reply content. You requested notification emails. You can turn them off in your notification preferences.`,
    });
    const saved = await finishNotificationEmail(job, result);
    return {
      message: !saved
        ? "Notification dispatch finished after cancellation or lease replacement; delivery is unconfirmed."
        : result.provider === "MOCK"
          ? "Notification email simulated locally."
          : result.dispatched
            ? "Notification email accepted by the provider."
            : "Notification email suppressed by the provider.",
    };
  } catch (error) {
    await finishNotificationEmail(job, null);
    throw error;
  }
}
