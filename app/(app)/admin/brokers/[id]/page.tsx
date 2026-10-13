import Link from "next/link";
import { notFound } from "next/navigation";
import { EditorForm } from "@/components/admin/editor-form";
import { PageHeader } from "@/components/common/page-header";
import { ExternalLink } from "@/components/common/external-link";
import { requireRole } from "@/lib/auth";
import { env } from "@/lib/config/env";
import { brokerRequirements } from "@/lib/brokers/requirements";
import { brokerReadiness } from "@/lib/brokers/readiness";
import { BrokerReadinessSummary } from "@/components/brokers/readiness-summary";
import { isAppError } from "@/lib/core/errors";
import { getBrokerAdministration } from "@/lib/db/repositories/adminBrokers";
import { listActiveJurisdictions } from "@/lib/db/repositories/catalog";
import {
  brokerFields,
  contactFields,
  coverageFields,
  newContactValues,
  newCoverageValues,
} from "../fields";
import {
  saveBrokerAction,
  saveContactAction,
  saveCoverageAction,
  setSendingAction,
} from "../actions";

export const metadata = { title: "Edit broker" };
const sections = {
  details: "Broker details",
  contacts: "Contact methods",
  coverage: "Jurisdiction coverage",
  sending: "Sending",
};
export default async function BrokerEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const actor = await requireRole("MAINTAINER");
  let broker;
  try {
    broker = await getBrokerAdministration(actor, (await params).id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const jurisdictions = await listActiveJurisdictions();
  const { saved } = await searchParams;
  const scope = {
    brokerId: broker.id,
    expectedUpdatedAt: broker.updatedAt.toISOString(),
  };
  const requirements = brokerRequirements(broker.verificationRequirements);
  const details = {
    ...scope,
    slug: broker.slug,
    legalName: broker.legalName,
    websiteUrl: broker.websiteUrl ?? "",
    category: broker.category,
    tradingNames: broker.tradingNames.join("\n"),
    countriesServed: broker.countriesServed.join(","),
    dataCategories: broker.dataCategories.join(","),
    sourceUrl: broker.sourceUrl ?? "",
    lastVerifiedAt: broker.lastVerifiedAt?.toISOString().slice(0, 10) ?? "",
    verificationStatus: broker.verificationStatus,
    confidenceScore: String(broker.confidenceScore),
    isActive: String(broker.isActive),
    isDemoData: String(broker.isDemoData),
    productionUnsafeFlag: String(broker.productionUnsafeFlag),
    manualReviewRequired: String(broker.manualReviewRequired),
    expectsIdentityDocument: String(requirements.identityDocument),
    accountRequired: String(requirements.accountRequired),
    notarisationRequired: String(requirements.notarised),
    verificationInstructions: requirements.notes,
    riskTier: broker.riskTier,
    notes: broker.notes ?? "",
  };
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-8">
      <Link href="/admin/brokers" className="text-sm underline">
        Broker administration
      </Link>
      <PageHeader
        title={broker.legalName}
        description="Catalogue edits disable sending until the final configuration is reviewed and explicitly enabled again. Existing message snapshots remain unchanged."
      />
      {saved && Object.hasOwn(sections, saved) ? (
        <p role="status">
          Changes saved. Broker sending is{" "}
          {broker.productionSendingEnabled ? "enabled" : "disabled"}.
        </p>
      ) : null}
      <nav aria-label="Broker configuration" className="flex flex-wrap gap-4 text-sm">
        {Object.entries(sections).map(([key, label]) => (
          <a key={key} href={`#${key}`} className="underline underline-offset-4">
            {label}
          </a>
        ))}
      </nav>
      <BrokerReadinessSummary readiness={brokerReadiness(broker)} operator />
      <section
        id="details"
        className="scroll-mt-24 space-y-4"
        aria-labelledby="details-title"
      >
        <h2 id="details-title" className="text-xl font-semibold">
          Broker details
        </h2>
        <EditorForm
          key={`details:${scope.expectedUpdatedAt}`}
          action={saveBrokerAction}
          initialValues={details}
          fields={brokerFields}
        />
      </section>
      <section
        id="contacts"
        className="scroll-mt-24 space-y-5 border-t pt-6"
        aria-labelledby="contacts-title"
      >
        <h2 id="contacts-title" className="text-xl font-semibold">
          Contact methods
        </h2>
        <p className="text-sm text-muted-foreground">
          Retire a method by making it inactive. Historical approvals keep their original
          destination; dispatch checks whether that destination is still active and
          verified.
        </p>
        {!broker.contactMethods.length ? (
          <p className="text-sm">
            No methods recorded. Add a public destination before preparing requests.
          </p>
        ) : null}
        {broker.contactMethods.map((method) => (
          <details
            key={`${method.id}:${scope.expectedUpdatedAt}`}
            className="border-t pt-4"
          >
            <summary className="cursor-pointer py-2 text-sm font-medium">
              {method.label || method.type.replaceAll("_", " ")} ·{" "}
              {method.isActive ? "Active" : "Inactive"} ·{" "}
              {method.isVerified ? "Verified" : "Unverified"}
            </summary>
            <div className="pt-4">
              <EditorForm
                action={saveContactAction}
                fields={contactFields}
                initialValues={{
                  ...scope,
                  contactId: method.id,
                  type: method.type,
                  value: method.value,
                  label: method.label ?? "",
                  isActive: String(method.isActive),
                  isPreferred: String(method.isPreferred),
                  priority: String(method.priority),
                  isVerified: "false",
                  verifiedAt: method.verifiedAt?.toISOString().slice(0, 10) ?? "",
                  sourceUrl: method.sourceUrl ?? "",
                  verificationNote: method.verificationNote ?? "",
                }}
              />
            </div>
          </details>
        ))}
        <details key={`new-contact:${scope.expectedUpdatedAt}`} className="border-t pt-4">
          <summary className="cursor-pointer py-2 font-medium">
            Add contact method
          </summary>
          <div className="pt-4">
            <EditorForm
              action={saveContactAction}
              initialValues={{ ...scope, ...newContactValues }}
              fields={contactFields}
              submitLabel="Add method"
            />
          </div>
        </details>
      </section>
      <section
        id="coverage"
        className="scroll-mt-24 space-y-5 border-t pt-6"
        aria-labelledby="coverage-title"
      >
        <h2 id="coverage-title" className="text-xl font-semibold">
          Jurisdiction coverage
        </h2>
        {!broker.jurisdictionCoverage.length ? (
          <p className="text-sm">
            No coverage recorded. Add the jurisdictions and request types supported by
            your sources.
          </p>
        ) : null}
        {broker.jurisdictionCoverage.map((row) => (
          <details key={`${row.id}:${scope.expectedUpdatedAt}`} className="border-t pt-4">
            <summary className="cursor-pointer py-2 text-sm font-medium">
              {row.jurisdiction.name} · {row.isActive ? "Active" : "Inactive"}
            </summary>
            <div className="pt-4">
              <EditorForm
                action={saveCoverageAction}
                fields={coverageFields(jurisdictions).filter(
                  (f) => f.name !== "jurisdictionId"
                )}
                initialValues={{
                  ...scope,
                  jurisdictionId: row.jurisdictionId,
                  coverageType: row.coverageType,
                  supportedRequestTypes: row.supportedRequestTypes.join(","),
                  confidence: row.confidence,
                  isActive: String(row.isActive),
                  notes: row.notes ?? "",
                }}
              />
            </div>
          </details>
        ))}
        <details
          key={`new-coverage:${scope.expectedUpdatedAt}`}
          className="border-t pt-4"
        >
          <summary className="cursor-pointer py-2 font-medium">
            Add jurisdiction coverage
          </summary>
          <div className="pt-4">
            <EditorForm
              action={saveCoverageAction}
              fields={coverageFields(jurisdictions)}
              initialValues={{ ...scope, ...newCoverageValues }}
              submitLabel="Save coverage"
            />
          </div>
        </details>
      </section>
      {broker.seedSources.length ? (
        <section className="space-y-3 border-t pt-6" aria-labelledby="source-title">
          <h2 id="source-title" className="text-xl font-semibold">
            Imported sources
          </h2>
          <ul className="space-y-3 text-sm">
            {broker.seedSources.map((source) => (
              <li key={source.id}>
                {source.sourceUrl ? (
                  <ExternalLink href={source.sourceUrl}>
                    {source.sourceTitle}
                  </ExternalLink>
                ) : (
                  source.sourceTitle
                )}
                <p className="text-muted-foreground">
                  Recorded {source.retrievedAt.toISOString().slice(0, 10)}
                  {source.isDemo ? " · Fictional demo source" : ""}
                </p>
                {source.notes ? <p>{source.notes}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section
        id="sending"
        className="scroll-mt-24 space-y-4 border-t pt-6"
        aria-labelledby="sending-title"
      >
        <h2 id="sending-title" className="text-xl font-semibold">
          Sending
        </h2>
        <p className="text-sm">
          Broker sending is{" "}
          <strong>{broker.productionSendingEnabled ? "enabled" : "disabled"}</strong>.
          External sending in deployment configuration is{" "}
          <strong>{env.ALLOW_EXTERNAL_SENDING ? "enabled" : "disabled"}</strong>. Instance
          sending approval, verified contact and coverage, an approved message and current
          user consent are all still required.
        </p>
        <EditorForm
          key={`sending:${scope.expectedUpdatedAt}`}
          action={setSendingAction}
          initialValues={{ ...scope, enabled: String(broker.productionSendingEnabled) }}
          fields={[
            {
              name: "enabled",
              label: "Allow sending to this broker",
              kind: "select",
              options: [
                { value: "false", label: "Disabled" },
                { value: "true", label: "Enabled after verification" },
              ],
            },
          ]}
          submitLabel="Save sending choice"
        />
      </section>
    </div>
  );
}
