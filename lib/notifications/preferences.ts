import { z } from "zod";

export { NOTIFICATION_EMAIL_NOTICE } from "./copy";
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
    /^\/(?:requests(?:\/[a-zA-Z0-9-]+(?:\/review)?)?|responses(?:\/[a-zA-Z0-9-]+)?|reports|household|notifications|settings\/privacy\/exports)$/.test(
      value
    )
    ? value
    : null;
}
