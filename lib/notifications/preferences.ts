import { z } from "zod";

export const NOTIFICATION_EMAIL_NOTICE =
  "Email me a generic reminder when a new notification needs my attention. Send it to my sign-in address. Keep broker names, profile details and reply content in the app. I can turn this off at any time; messages already handed to the email provider cannot be recalled.";
export const notificationPreferenceSchema = z.object({
  version: z.literal(1),
  emailEnabled: z.boolean(),
  emailConsentId: z.uuid().nullable(),
  updatedAt: z.iso.datetime(),
  noticeHash: z.string().length(64),
});
export function notificationPreferences(value: unknown) {
  const record = z
    .object({ notifications: notificationPreferenceSchema })
    .safeParse(value);
  return record.success ? record.data.notifications : null;
}

/** Older stored notifications must not turn their action link into an external navigation. */
export function notificationHref(value: string | null): string | null {
  return value &&
    /^\/(?:requests(?:\/[a-zA-Z0-9-]+(?:\/review)?)?|responses(?:\/[a-zA-Z0-9-]+)?|reports|household|notifications)$/.test(
      value
    )
    ? value
    : null;
}
