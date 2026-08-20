import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { ExternalLink } from "@/components/common/external-link";
import { requireActorOrRedirect } from "@/lib/auth";
import { getOwnedProfile } from "@/lib/db/repositories/profiles";
import {
  listBrokersForDirectory,
  listActiveJurisdictions,
  listPublishedLegalRules,
} from "@/lib/db/repositories/catalog";
import { resolveActiveProfile } from "@/lib/profiles/resolveActive";
import { evaluateConsent } from "@/lib/consent/status";
import { resolveJurisdiction } from "@/lib/jurisdiction/resolve";
import { isAppError } from "@/lib/core/errors";

import { createWorkflow } from "./actions";

export const metadata = { title: "New removal workflow" };
export const dynamic = "force-dynamic";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ brokers?: string; error?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const { active } = await resolveActiveProfile(actor);
  const params = await searchParams;
  const preselected = new Set((params.brokers ?? "").split(",").filter(Boolean));

  if (!active) {
    return (
      <Alert>
        <AlertTitle>A profile is required</AlertTitle>
        <AlertDescription>
          <a className="underline" href="/onboarding">
            Set up your profile
          </a>{" "}
          before generating requests.
        </AlertDescription>
      </Alert>
    );
  }

  const profile = await getOwnedProfile(actor, active.id);
  const consent = evaluateConsent({
    profileId: profile.id,
    kind: profile.kind,
    consentStatus: profile.consentStatus,
    consentVerifiedAt:
      profile.householdMember?.consents[0]?.verifiedAt ??
      (profile.kind === "SELF" ? new Date() : null),
  });

  const brokers = await listBrokersForDirectory({});
  const jurisdictions = await listActiveJurisdictions();
  const rules = await listPublishedLegalRules();
  let jurisdictionCard: {
    name: string;
    types: string;
    legalBasis: string;
    deadline: string;
    confidence: string;
    review: boolean;
    sourceUrl: string;
    sourceTitle: string;
    notes: string[];
  } | null = null;
  try {
    const resolved = resolveJurisdiction(
      {
        countryCode: profile.countryCode,
        region: profile.region,
        residencyConfirmed: profile.residencyConfirmed,
      },
      jurisdictions,
      rules
    );
    const primary = resolved.rules[0];
    jurisdictionCard = {
      name: resolved.jurisdiction.name,
      types: resolved.availableRequestTypes.join(", ") || "None published",
      legalBasis: primary?.legalBasisText ?? "No published rule",
      deadline: primary?.deadlineDays ? `${primary.deadlineDays} days` : "Not specified",
      confidence: resolved.confidence,
      review: resolved.requiresLegalReview,
      sourceUrl: primary?.sourceUrl ?? "",
      sourceTitle: primary?.sourceTitle ?? "Source",
      notes: resolved.notes,
    };
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Start new removal workflow"
        description="Drafts are generated from the published legal rule and template. Nothing is sent until you approve the exact text."
      />
      {!consent.allowed ? (
        <Alert variant="destructive">
          <AlertTitle>Consent is not complete</AlertTitle>
          <AlertDescription>{consent.reason}</AlertDescription>
        </Alert>
      ) : null}
      {params.error ? (
        <Alert variant="destructive">
          <AlertTitle>Drafts could not be generated</AlertTitle>
          <AlertDescription>
            {params.error === "QUOTA_EXCEEDED"
              ? "A fair use limit was reached. Limits are operational, not a paid upgrade."
              : params.error === "CONSENT_REQUIRED"
                ? "Consent is not complete for this profile."
                : params.error === "VALIDATION_FAILED"
                  ? "Choose at least one broker and one identifier."
                  : "Check the form and try again."}{" "}
            Error code: <code>{params.error}</code>
          </AlertDescription>
        </Alert>
      ) : null}

      {jurisdictionCard ? (
        <Card>
          <CardHeader>
            <CardTitle>Jurisdiction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{jurisdictionCard.name}</p>
            <p>Available request types: {jurisdictionCard.types}</p>
            <p>{jurisdictionCard.legalBasis}</p>
            <p>Deadline: {jurisdictionCard.deadline}</p>
            <p>
              Confidence: {jurisdictionCard.confidence}
              {jurisdictionCard.review ? " · Requires legal review" : ""}
            </p>
            {jurisdictionCard.sourceUrl ? (
              <ExternalLink href={jurisdictionCard.sourceUrl}>
                {jurisdictionCard.sourceTitle}
              </ExternalLink>
            ) : null}
            {jurisdictionCard.notes.map((note) => (
              <p key={note} className="text-muted-foreground">
                {note}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertTitle>No jurisdiction pack</AlertTitle>
          <AlertDescription>
            Confirm residency on the profile before drafts can be generated.
          </AlertDescription>
        </Alert>
      )}

      <form action={createWorkflow} className="flex flex-col gap-6">
        <input type="hidden" name="profileId" value={profile.id} />
        <section className="rounded-xl border p-4">
          <h2 className="font-heading text-base font-medium">Profile</h2>
          <p className="text-sm">
            {profile.displayName}{" "}
            <StatusBadge kind="consent" status={profile.consentStatus} />
          </p>
        </section>
        <section className="flex flex-col gap-2 rounded-xl border p-4">
          <h2 className="font-heading text-base font-medium">Request type</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="requestType" value="DELETION" defaultChecked />
            Deletion / erasure
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="requestType" value="ACCESS" />
            Access
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="requestType" value="OPT_OUT" />
            Opt out
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="requestType" value="SUPPRESSION" />
            Suppression
          </label>
        </section>
        <section className="flex flex-col gap-2 rounded-xl border p-4">
          <h2 className="font-heading text-base font-medium">Identifiers to include</h2>
          {profile.identifiers.map((identifier) => (
            <label key={identifier.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="identifierId"
                value={identifier.id}
                defaultChecked={identifier.isPrimary}
              />
              {identifier.type.toLowerCase().replaceAll("_", " ")} —{" "}
              {identifier.maskedPreview}
            </label>
          ))}
        </section>
        <section className="flex flex-col gap-2 rounded-xl border p-4">
          <h2 className="font-heading text-base font-medium">Brokers</h2>
          <div className="max-h-80 overflow-auto">
            {brokers.slice(0, 60).map((broker) => (
              <label key={broker.id} className="flex items-center gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  name="brokerId"
                  value={broker.id}
                  defaultChecked={preselected.has(broker.id)}
                />
                {broker.legalName}
                {broker.isDemoData ? " (demo)" : ""}
              </label>
            ))}
          </div>
        </section>
        <Button type="submit" disabled={!consent.allowed}>
          Generate drafts
        </Button>
      </form>
    </div>
  );
}
