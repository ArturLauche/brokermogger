import { ConfirmSubmitButton } from "@/components/common/confirm-submit-button";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { maskEmail } from "@/lib/security/masking";
import { formatUtcStamp } from "@/lib/format/datetime";

import { deleteAccountAction, revokeSessionAction, updateAccountAction } from "./actions";

export const metadata = { title: "Account settings" };
export const dynamic = "force-dynamic";

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const user = await getSessionUser();
  const account = await getOwnedAccount(actor);
  const params = await searchParams;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
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
      <form
        action={updateAccountAction}
        className="flex flex-col gap-4 rounded-xl border p-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Display name</Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={80}
            defaultValue={account.name ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Email</Label>
          <p className="font-mono text-sm">{user ? maskEmail(user.email) : "—"}</p>
          <p className="text-sm text-muted-foreground">
            The sign-in address cannot be changed in this version.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <Input id="timezone" name="timezone" defaultValue={account.timezone} />
        </div>
        <Button type="submit">Save account</Button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-medium">Sessions</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Expires</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {account.sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>{formatUtcStamp(session.expires)}</TableCell>
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
          description="This queues deletion of identifiers and anonymises the account."
          consequences={["You will lose access after the deletion job runs."]}
          confirmationPhrase="DELETE"
          destructive
        />
      </section>
    </div>
  );
}
