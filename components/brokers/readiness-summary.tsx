import type { BrokerReadiness } from "@/lib/brokers/readiness";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function BrokerReadinessSummary({
  readiness,
  operator = false,
}: {
  readiness: BrokerReadiness;
  operator?: boolean;
}) {
  return (
    <section className="space-y-4 border-t pt-6" aria-labelledby="readiness-title">
      <h2 id="readiness-title" className="text-xl font-semibold">
        Verification readiness
      </h2>
      <p className="font-medium">{readiness.label}</p>
      <p className="text-sm leading-6">{readiness.description}</p>
      <p className="text-sm text-muted-foreground">{readiness.verificationExplanation}</p>
      <p className="text-sm">{readiness.reviewed.label}</p>
      {operator && readiness.blockingReasons.length ? (
        <div className="space-y-2 text-sm">
          <h3 className="font-semibold">Before enabling this broker</h3>
          <ul className="list-disc space-y-2 pl-5">
            {readiness.blockingReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p>
            Review broker details, dated contact evidence and active jurisdiction/request
            coverage below. Save each change, then review the complete configuration
            before explicitly enabling sending.
          </p>
        </div>
      ) : null}
      {operator && readiness.activationReady ? (
        <p className="text-sm">
          The recorded activation requirements are complete. Enabling the broker is still
          an explicit operator decision and does not send a request.
        </p>
      ) : null}
      {readiness.warnings.length ? (
        <Alert>
          <AlertTitle>Source review due</AlertTitle>
          <AlertDescription>
            {readiness.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <p>
              The 90-day review reminder does not establish legal applicability or change
              sending permissions.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
