# Notifications and email preferences

The notification inbox includes request, correspondence and household updates
across the account's profiles. The default view shows unread updates; filters
include all active and dismissed updates. Marking an update read or dismissing it
does not change the underlying request. Lists use stable pages of 25 records.

Optional email reminders are off by default. A verified account holder can opt in
at `/notifications#preferences`. The stored preference records a versioned notice
hash and a new consent identifier. Only notifications created under that current
consent can enqueue an email. Enabling email never replays older notifications.
Sign-in links and explicitly requested household invitations are separate.

Email reminders contain a generic message and a link to the inbox. Broker names,
profile details and reply content remain in the application. Notification creation
and its optional email job commit in one transaction. The worker rechecks the
account, preference, exact consent identifier, unread state and current job lease
before dispatch. Read, dismiss, opt-out and account deletion cancel pending work.

An email already being dispatched cannot be recalled. If cancellation races with
a provider call, the inbox describes delivery as unconfirmed. An uncertain attempt
keeps the original provider idempotency key and cannot automatically replay after
the provider retention safety window. The in-app update remains available.

The upgrade converts unsent legacy notifications to in-app updates and cancels
their email jobs because they lack this explicit preference proof. Existing read,
dismissed and sent history is preserved. Deploy app and worker together.
