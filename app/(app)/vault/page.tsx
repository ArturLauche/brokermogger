import { LockIcon } from "lucide-react";
import Link from "next/link";

import { ConfirmSubmitButton } from "@/components/common/confirm-submit-button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Timeline } from "@/components/common/timeline";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { resolveActiveProfileForRequest } from "@/app/_lib/active-profile";
import { requireActorOrRedirect } from "@/lib/auth";
import { getOwnedProfile } from "@/lib/db/repositories/profiles";
import { listConsentRecordsForProfile } from "@/lib/db/repositories/household";
import { formatUtcStamp } from "@/lib/format/datetime";
import { IDENTIFIER_TYPE_LABELS } from "@/lib/requests/labels";

import {
  addIdentifierAction,
  deleteAccountFromVaultAction,
  deleteIdentifierAction,
  deleteProfileAction,
} from "./actions";
import { VaultMaskedIdentifier } from "./masked-identifier";

export const metadata = { title: "Data vault" };
export const dynamic = "force-dynamic";

export default async function VaultPage() {
  const actor = await requireActorOrRedirect();
  const { active } = await resolveActiveProfileForRequest(actor);

  if (!active) {
    return (
      <EmptyState
        icon={LockIcon}
        title="No identifiers stored"
        description="Set up your profile first. Identifiers live on a profile."
        action={
          <Button asChild>
            <Link href="/onboarding">Set up your profile</Link>
          </Button>
        }
      />
    );
  }

  const profile = await getOwnedProfile(actor, active.id);
  const consents = await listConsentRecordsForProfile(actor, profile.id);
  const addresses = profile.identifiers.filter(
    (item) => item.type === "POSTAL_ADDRESS" || item.type === "PREVIOUS_ADDRESS"
  );
  const other = profile.identifiers.filter(
    (item) => item.type !== "POSTAL_ADDRESS" && item.type !== "PREVIOUS_ADDRESS"
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Data vault"
        description={`Stored identifiers for ${profile.displayName}. Values stay masked until you choose Show.`}
      />
      <Tabs defaultValue="identifiers">
        <TabsList>
          <TabsTrigger value="identifiers">Identifiers</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="household">Household</TabsTrigger>
          <TabsTrigger value="consent">Consent</TabsTrigger>
          <TabsTrigger value="export">Export and deletion</TabsTrigger>
        </TabsList>
        <TabsContent value="identifiers" className="flex flex-col gap-4">
          {other.length === 0 ? (
            <EmptyState
              icon={LockIcon}
              title="No identifiers stored"
              description="Add an identifier or finish onboarding."
              action={
                <Button asChild>
                  <Link href="/onboarding">Set up your profile</Link>
                </Button>
              }
            />
          ) : (
            <IdentifierTable rows={other} />
          )}
          <AddIdentifierForm profileId={profile.id} />
        </TabsContent>
        <TabsContent value="addresses" className="flex flex-col gap-4">
          {addresses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No addresses stored.</p>
          ) : (
            <IdentifierTable rows={addresses} />
          )}
          <AddIdentifierForm profileId={profile.id} address />
        </TabsContent>
        <TabsContent value="household">
          <p className="text-sm text-muted-foreground">
            Household adults are managed on the{" "}
            <Link className="underline" href="/household">
              household
            </Link>{" "}
            screen. Consent must be explicit before requests can be generated.
          </p>
        </TabsContent>
        <TabsContent value="consent">
          {consents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No consent records yet.</p>
          ) : (
            <Timeline
              label="Consent records"
              events={consents.map((row) => ({
                id: row.id,
                title: `${row.purpose.replaceAll("_", " ").toLowerCase()} · ${row.method.replaceAll("_", " ").toLowerCase()}`,
                timestamp: formatUtcStamp(row.createdAt),
                dateTime: row.createdAt.toISOString(),
                detail: <StatusBadge kind="consent" status={row.status} />,
              }))}
            />
          )}
        </TabsContent>
        <TabsContent value="export" className="flex flex-col gap-4">
          <Button asChild>
            <Link href="/api/account/export">Download a copy of my data</Link>
          </Button>
          <ConfirmSubmitButton
            action={deleteProfileAction}
            hidden={{ profileId: profile.id }}
            label="Delete this profile"
            title="Delete this profile"
            description="Identifiers on this profile will be marked deleted. Existing request history remains until account deletion."
            consequences={["The profile can no longer be used for new requests."]}
            confirmationPhrase="DELETE"
            destructive
          />
          <ConfirmSubmitButton
            action={deleteAccountFromVaultAction}
            hidden={{}}
            label="Delete my account"
            title="Delete my account"
            description="This queues deletion of identifiers and anonymises the account. It cannot be undone."
            consequences={[
              "Open jobs will be cancelled.",
              "You will be signed out after the job runs.",
            ]}
            confirmationPhrase="DELETE"
            destructive
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function IdentifierTable({
  rows,
}: {
  rows: {
    id: string;
    type: keyof typeof IDENTIFIER_TYPE_LABELS;
    maskedPreview: string;
    isPrimary: boolean;
  }[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Primary</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{IDENTIFIER_TYPE_LABELS[row.type]}</TableCell>
            <TableCell>
              <VaultMaskedIdentifier
                identifierId={row.id}
                maskedValue={row.maskedPreview}
                label={IDENTIFIER_TYPE_LABELS[row.type].toLowerCase()}
              />
            </TableCell>
            <TableCell>{row.isPrimary ? "Yes" : "No"}</TableCell>
            <TableCell>
              <form action={deleteIdentifierAction}>
                <input type="hidden" name="identifierId" value={row.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Delete
                </Button>
              </form>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AddIdentifierForm({
  profileId,
  address = false,
}: {
  profileId: string;
  address?: boolean;
}) {
  return (
    <form action={addIdentifierAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="profileId" value={profileId} />
      <label className="flex flex-col gap-1 text-sm">
        Type
        <select name="type" className="h-9 rounded-lg border border-input px-2">
          {address ? (
            <>
              <option value="POSTAL_ADDRESS">Postal address</option>
              <option value="PREVIOUS_ADDRESS">Previous address</option>
            </>
          ) : (
            <>
              <option value="EMAIL">Email</option>
              <option value="PHONE">Phone</option>
              <option value="PREVIOUS_NAME">Previous name</option>
              <option value="APPROXIMATE_LOCATION">Approximate location</option>
              <option value="USERNAME">Username</option>
              <option value="OTHER">Other</option>
            </>
          )}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Value
        <input
          name="value"
          required
          maxLength={180}
          className="h-9 rounded-lg border border-input px-2"
        />
      </label>
      <Button type="submit">Add identifier</Button>
    </form>
  );
}
