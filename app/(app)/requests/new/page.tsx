import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { ExternalLink } from "@/components/common/external-link";
import { resolveActiveProfileForRequest } from "@/app/_lib/active-profile";
import { requireActorOrRedirect } from "@/lib/auth";
import { getOwnedProfile } from "@/lib/db/repositories/profiles";
import {
  listBrokersForDirectory,
  listActiveJurisdictions,
  listPublishedLegalRules,
  getSelectedBrokersForChoice,
  listPublishedTemplateTypes,
} from "@/lib/db/repositories/catalog";
import { assertCurrentProfileConsent } from "@/lib/consent/current";
import { resolveJurisdiction } from "@/lib/jurisdiction/resolve";
import { isAppError } from "@/lib/core/errors";
import { entityIdSchema } from "@/lib/validation/ids";
import { MAX_BROKERS_PER_WORKFLOW } from "@/lib/requests/fairUse";
import { applicableInitialTypes } from "@/lib/requests/initial";
import { IDENTIFIER_TYPE_LABELS } from "@/lib/requests/labels";
import { WorkflowForm } from "./workflow-form";

export const metadata = { title: "New privacy request" };
export const dynamic = "force-dynamic";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ brokers?: string; search?: string; cursor?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const { active } = await resolveActiveProfileForRequest(actor);
  const params = await searchParams;
  const header = (
    <PageHeader
      title="Start a privacy request"
      description="Prepare a letter, review the selected details, then approve the exact message before submission."
    />
  );
  if (!active)
    return (
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
        {header}
        <Alert>
          <AlertTitle>A profile is required</AlertTitle>
          <AlertDescription>
            <Link className="underline" href="/onboarding">
              Set up your profile
            </Link>{" "}
            before generating requests.
          </AlertDescription>
        </Alert>
      </div>
    );
  const profile = await getOwnedProfile(actor, active.id);
  try {
    assertCurrentProfileConsent(profile);
  } catch (error) {
    if (!isAppError(error)) throw error;
    return (
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
        {header}
        <Alert>
          <AlertTitle>Complete profile consent</AlertTitle>
          <AlertDescription>
            {error.message}{" "}
            <Link
              className="underline"
              href={profile.kind === "SELF" ? "/onboarding" : "/household"}
            >
              {profile.kind === "SELF" ? "Finish setup" : "Review household consent"}
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  const [jurisdictions, rules] = await Promise.all([
    listActiveJurisdictions(),
    listPublishedLegalRules(),
  ]);
  let resolved;
  try {
    resolved = resolveJurisdiction(profile, jurisdictions, rules);
  } catch (error) {
    if (!isAppError(error)) throw error;
    return (
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
        {header}
        <Alert>
          <AlertTitle>Review the profile location</AlertTitle>
          <AlertDescription>
            {error.message}{" "}
            <Link
              className="underline"
              href={`/vault/profiles/${encodeURIComponent(profile.id)}/edit`}
            >
              Review profile
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  const preselected = new Set(
    (params.brokers ?? "")
      .split(",")
      .filter((id) => entityIdSchema.safeParse(id).success)
      .slice(0, MAX_BROKERS_PER_WORKFLOW)
  );
  const [directory, selected, templated] = await Promise.all([
    listBrokersForDirectory({ search: params.search, cursor: params.cursor }),
    getSelectedBrokersForChoice([...preselected]),
    listPublishedTemplateTypes(resolved.jurisdiction.id),
  ]);
  const brokers = [
    ...new Map(
      [...selected, ...directory.items].map((broker) => [broker.id, broker])
    ).values(),
  ];
  const types = applicableInitialTypes(resolved.availableRequestTypes, templated);
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-8">
      {header}
      <section className="space-y-3 border-b pb-6" aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="text-lg font-semibold">
          {profile.displayName}
        </h2>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {resolved.jurisdiction.name}{" "}
          <StatusBadge kind="consent" status={profile.consentStatus} />
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer py-2 font-medium">
            Applicable rules and review notes
          </summary>
          <div className="space-y-4 pt-2">
            <p className="text-muted-foreground">
              Response timing starts after submission. The request review identifies the
              rule and source used for the selected request type.
            </p>
            {resolved.rules.map((rule) => (
              <div key={rule.legalRuleVersionId} className="space-y-1">
                <p className="font-medium">{rule.lawName}</p>
                <p>{rule.legalBasisText}</p>
                <p className="text-muted-foreground">
                  Confidence: {rule.confidence.toLowerCase()}
                  {rule.requiresLegalReview ? " · Requires legal review" : ""}
                </p>
                <ExternalLink href={rule.sourceUrl}>{rule.sourceTitle}</ExternalLink>
              </div>
            ))}
            {resolved.notes.map((note) => (
              <p key={note} className="text-muted-foreground">
                {note}
              </p>
            ))}
          </div>
        </details>
      </section>
      <WorkflowForm
        directory={{
          total: directory.total,
          nextCursor: directory.nextCursor,
          cursor: params.cursor ?? "",
          search: params.search ?? "",
          brokerQuery: selected.map((broker) => broker.id).join(","),
        }}
        initial={{
          profileId: profile.id,
          requestType: types[0] ?? "",
          brokerIds: selected.map((broker) => broker.id).join(","),
          identifierIds: profile.identifiers
            .filter((row) => row.isPrimary)
            .map((row) => row.id)
            .join(","),
        }}
        types={types}
        identifiers={profile.identifiers.map((row) => ({
          id: row.id,
          label: `${IDENTIFIER_TYPE_LABELS[row.type]} — ${row.maskedPreview}`,
        }))}
        brokers={brokers.map((broker) => ({
          id: broker.id,
          label: `${broker.legalName}${broker.isDemoData ? " (demo)" : ""}`,
          active: broker.isActive,
          supportedTypes:
            broker.jurisdictionCoverage.find(
              (row) => row.isActive && row.jurisdictionId === resolved.jurisdiction.id
            )?.supportedRequestTypes ?? [],
        }))}
      />
    </div>
  );
}
