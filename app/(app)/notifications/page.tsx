import Link from "next/link";
import { requireActorOrRedirect } from "@/lib/auth";
import { getDateFormatter } from "@/app/_lib/datetime";
import {
  getNotificationPreferences,
  listOwnedNotifications,
} from "@/lib/db/repositories/notifications";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NotificationActions, NotificationPreferencesForm } from "./notification-forms";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; cursor?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const query = await searchParams;
  const filter =
    query.filter === "all" || query.filter === "dismissed" ? query.filter : "unread";
  const [page, preferences, { formatStamp }] = await Promise.all([
    listOwnedNotifications(actor, { cursor: query.cursor, filter }),
    getNotificationPreferences(actor),
    getDateFormatter(),
  ]);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Updates across all your profiles. Read the related request or reply before taking action."
      />
      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="notification-filter">Show</Label>
          <select
            id="notification-filter"
            name="filter"
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={filter}
          >
            <option value="unread">Unread</option>
            <option value="all">All active notifications</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
        <Button variant="outline">Apply filter</Button>
      </form>
      {page.items.length ? (
        <ul className="divide-y border-y" aria-label="Notifications">
          {page.items.map((row) => (
            <li key={row.id} className="space-y-3 py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold">{row.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {row.readAt ? "Read" : "Unread"} ·{" "}
                  <time dateTime={row.createdAt.toISOString()}>
                    {formatStamp(row.createdAt)}
                  </time>
                </p>
              </div>
              <p className="text-sm leading-6">{row.body}</p>
              {row.actionUrl ? (
                <Link
                  href={row.actionUrl}
                  className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
                >
                  Review update<span className="sr-only">: {row.title}</span>
                </Link>
              ) : null}
              {row.emailDispatchState === "AMBIGUOUS" ||
              row.emailDispatchState === "RECONCILIATION_REQUIRED" ? (
                <p className="text-sm text-muted-foreground">
                  Email delivery is unconfirmed. This in-app update remains available.
                </p>
              ) : row.emailedAt ? (
                <p className="text-sm text-muted-foreground">
                  {row.emailProvider === "MOCK"
                    ? "Email reminder simulated locally."
                    : "Email reminder accepted by the provider."}
                </p>
              ) : null}
              <NotificationActions
                id={row.id}
                read={Boolean(row.readAt)}
                dismissed={Boolean(row.dismissedAt)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <section className="space-y-2 border-y py-8">
          <h2 className="text-lg font-semibold">
            {filter === "unread"
              ? "You have no unread notifications"
              : "No notifications in this view"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Request, reply and household updates appear here. Changing this view does not
            change your requests.
          </p>
        </section>
      )}
      <nav aria-label="Notification pages" className="flex gap-3">
        {query.cursor ? (
          <Button asChild variant="outline">
            <Link href={`/notifications?filter=${filter}`}>First page</Link>
          </Button>
        ) : null}
        {page.nextCursor ? (
          <Button asChild variant="outline">
            <Link href={`/notifications?filter=${filter}&cursor=${page.nextCursor}`}>
              Next 25 notifications
            </Link>
          </Button>
        ) : null}
      </nav>
      <section
        id="preferences"
        aria-labelledby="notification-preferences"
        className="space-y-4 border-t pt-6"
      >
        <h2 id="notification-preferences" className="text-xl font-semibold">
          Email preferences
        </h2>
        <p className="text-sm text-muted-foreground">
          In-app notifications are always available. Sign-in links and invitations you
          explicitly request are separate from these optional reminders.
        </p>
        <NotificationPreferencesForm emailEnabled={preferences.emailEnabled} />
      </section>
    </div>
  );
}
