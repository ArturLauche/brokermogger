import { UsersIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { WhyWeAsk } from "@/components/common/why-we-ask";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { requireActorOrRedirect } from "@/lib/auth";
import { HOUSEHOLD_ADULT_CONFIRMATION, listHousehold } from "@/lib/household/service";

import { inviteAdultAction, removeMemberAction } from "./actions";

export const metadata = { title: "Household profiles" };
export const dynamic = "force-dynamic";

export default async function HouseholdPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const members = await listHousehold(actor);
  const params = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Household profiles"
        description="Add another adult only with their explicit consent. Children's data is not collected in this version."
      />
      <Alert>
        <AlertTitle>Children&apos;s data is not collected</AlertTitle>
        <AlertDescription>
          Guardian-managed minor profiles are blocked. You can only invite another adult.
        </AlertDescription>
      </Alert>
      {params.sent ? (
        <Alert>
          <AlertTitle>Invitation sent.</AlertTitle>
          <AlertDescription>
            The row stays at consent pending until they accept.
          </AlertDescription>
        </Alert>
      ) : null}
      {params.error ? (
        <Alert variant="destructive">
          <AlertTitle>The invitation could not be sent</AlertTitle>
          <AlertDescription>
            Check the email address, relationship and adult confirmation.
          </AlertDescription>
        </Alert>
      ) : null}

      {members.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="You are only managing your own profile"
          description="Invite another adult when they have asked you to handle requests for them."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Display name</TableHead>
              <TableHead>Relationship</TableHead>
              <TableHead>Consent</TableHead>
              <TableHead>Invited email</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>{member.profile.displayName}</TableCell>
                <TableCell>
                  {member.relationship.replaceAll("_", " ").toLowerCase()}
                </TableCell>
                <TableCell>
                  <StatusBadge kind="consent" status={member.profile.consentStatus} />
                </TableCell>
                <TableCell>{member.invitedEmailMasked ?? "—"}</TableCell>
                <TableCell>
                  <form action={removeMemberAction}>
                    <input type="hidden" name="memberId" value={member.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Remove
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <form
        action={inviteAdultAction}
        className="flex max-w-xl flex-col gap-4 rounded-xl border p-4"
      >
        <h2 className="font-heading text-base font-medium">Add an adult you manage</h2>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="displayName">Display name</Label>
            <WhyWeAsk
              field="display name"
              purpose="A label for this household profile in your account."
              requirement="required"
              deletion="You can remove the household member later."
            />
          </div>
          <Input id="displayName" name="displayName" required maxLength={80} />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="relationship">Relationship</Label>
            <WhyWeAsk
              field="relationship"
              purpose="Records why you manage this adult's requests."
              requirement="required"
              deletion="Removed with the household member."
            />
          </div>
          <select
            id="relationship"
            name="relationship"
            required
            className="h-9 rounded-lg border border-input px-2"
          >
            <option value="SPOUSE_OR_PARTNER">Spouse or partner</option>
            <option value="PARENT">Parent</option>
            <option value="ADULT_CHILD">Adult child</option>
            <option value="SIBLING">Sibling</option>
            <option value="OTHER_ADULT">Other adult</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="invitedEmail">Email of the person</Label>
            <WhyWeAsk
              field="their email address"
              purpose="Sends the double opt-in invitation. Requests cannot be generated until they accept."
              requirement="required"
              deletion="Deleted with the household member."
            />
          </div>
          <Input
            id="invitedEmail"
            name="invitedEmail"
            type="email"
            required
            maxLength={254}
          />
        </div>
        <input type="hidden" name="countryCode" value="DE" />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="adultConfirmed"
            value="on"
            required
            className="mt-1"
          />
          {HOUSEHOLD_ADULT_CONFIRMATION}
        </label>
        <Button type="submit">Add an adult you manage</Button>
      </form>
    </div>
  );
}
