import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmSubmitButton } from "@/components/common/confirm-submit-button";
import { Button } from "@/components/ui/button";
import { requireActorOrRedirect } from "@/lib/auth";
import { listHousehold } from "@/lib/household/service";
import { profileIdentityDigest } from "@/lib/requests/envelope";
import { deleteProfileAction } from "../vault/actions";
import { InvitationForm, MemberActions } from "./household-forms";
export const metadata = { title: "Household profiles" };
export default async function HouseholdPage() {
  const actor = await requireActorOrRedirect();
  const members = await listHousehold(actor);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Household profiles"
        description="Manage another adult’s requests with their explicit permission. Children’s profiles are not supported."
      />
      <section className="space-y-5" aria-label="Household members">
        {!members.length && (
          <p className="text-sm text-muted-foreground">
            You currently manage only your own profile. Add a household adult below when
            they ask for your help.
          </p>
        )}
        {members.map((member) => {
          const consent = member.consents[0];
          const bound =
            (consent?.scope as { profileDigest?: string } | undefined)?.profileDigest ===
            profileIdentityDigest(member.profile);
          const status = !bound
            ? "New invitation required"
            : member.invitationExpired
              ? "Invitation expired"
              : {
                  PENDING: "Waiting for consent",
                  VERIFIED: "Permission granted",
                  DECLINED: "Invitation declined",
                  EXPIRED: "Invitation expired",
                  REVOKED: "Permission withdrawn",
                }[consent?.status ?? "PENDING"];
          return (
            <article key={member.id} className="space-y-4 rounded-lg border p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{member.profile.displayName}</h2>
                  <p className="text-sm text-muted-foreground">
                    {member.relationship.replaceAll("_", " ").toLowerCase()} ·{" "}
                    {member.invitedEmailMasked ?? "Contact email needed"}
                  </p>
                  <p className="text-sm font-medium">{status}</p>
                </div>
                <Button asChild variant="outline">
                  <Link href={`/vault/profiles/${member.profileId}/edit`}>
                    Edit profile
                  </Link>
                </Button>
              </div>
              <MemberActions
                memberId={member.id}
                verified={bound && consent?.status === "VERIFIED"}
              />
              <ConfirmSubmitButton
                action={deleteProfileAction}
                hidden={{ profileId: member.profileId }}
                label="Delete household profile"
                title="Delete household profile"
                description="Erase this profile’s identifiers and related message content. Queued requests are cancelled and files are queued for cleanup."
                consequences={[
                  "Minimal pseudonymous consent and audit proof is retained.",
                  "Previously accepted messages cannot be recalled.",
                ]}
                confirmationPhrase="DELETE"
                destructive
              />
            </article>
          );
        })}
      </section>
      <InvitationForm />
    </div>
  );
}
