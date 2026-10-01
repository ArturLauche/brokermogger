import { ConfirmSubmitButton } from "@/components/common/confirm-submit-button";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireActorOrRedirect, getSessionUser } from "@/lib/auth";
import { getOwnedAccount } from "@/lib/db/repositories/account";
import { AccountForm } from "./account-form";
import Link from "next/link";
import { maskEmail } from "@/lib/security/masking";
import { getDateFormatter } from "@/app/_lib/datetime";

import { deleteAccountAction, revokeSessionAction } from "./actions";

export const metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const { formatStamp } = await getDateFormatter();
  const user = await getSessionUser();
  const account = await getOwnedAccount(actor);
  const params = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Account settings"
        description="Sign in details, sessions and account deletion."
      />
      {params.saved ? (
        <Alert>
          <AlertTitle>Account updated.</AlertTitle>
        </Alert>
      ) : null}
      {params.error ? (
        <Alert variant="destructive">
          <AlertTitle>Display name must be between 1 and 80 characters.</AlertTitle>
        </Alert>
      ) : null}
      <AccountForm
        initial={{ name: account.name ?? "", timezone: account.timezone }}
        maskedEmail={user ? maskEmail(user.email) : "—"}
      />

      <section className="space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <p className="text-sm text-muted-foreground">
          Review in-app updates and choose whether to receive optional email reminders.
        </p>
        <Link
          className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          href="/notifications#preferences"
        >
          Manage notification preferences
        </Link>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">Sessions</h2>
        <Table scrollLabel="Active sessions">
          <TableHeader>
            <TableRow>
              <TableHead>Expires</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {account.sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>{formatStamp(session.expires)}</TableCell>
                <TableCell>
                  <form action={revokeSessionAction}>
                    <input type="hidden" name="sessionId" value={session.id} />
                    <Button type="submit" variant="outline" size="sm">
                      Revoke
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">Danger zone</h2>
        <ConfirmSubmitButton
          action={deleteAccountAction}
          hidden={{}}
          label="Delete my account"
          title="Delete my account"
          description="Access is blocked immediately. A resumable background job erases personal content and stored files."
          consequences={[
            "All sessions are revoked and queued work is cancelled immediately.",
            "Cleanup stays pending until stored files are removed. Minimal pseudonymous audit and consent proof follows the instance retention periods.",
            "Operator-controlled backups expire under the operator's backup policy; contact the operator for details.",
          ]}
          confirmationPhrase="DELETE"
          destructive
        />
      </section>
    </div>
  );
}
