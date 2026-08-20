/**
 * No billing exists in this product. The section explains the operational
 * limits so that hitting one is never a surprise and never reads like an
 * upsell, because there is nothing to buy.
 */
import { Section } from "@/components/marketing/section";
import { Card, CardContent } from "@/components/ui/card";

const DEFAULT_LIMITS = [
  { label: "New requests per day", value: "25" },
  { label: "New requests per month", value: "200" },
  { label: "Requests to the same broker within 30 days", value: "5" },
  { label: "Profiles per account", value: "6" },
];

export function FreeAccess() {
  return (
    <Section
      id="free-access"
      title="Free, with no paid tier"
      description="There is no subscription, no upgrade and no checkout. The project contains no billing code at all, so there is nothing that could be locked behind a payment."
    >
      <div className="flex flex-col gap-6">
        <p className="max-w-3xl text-sm text-pretty text-muted-foreground">
          Limits exist for operational reasons only. They protect the reputation of the
          mail server the instance sends from and stop a single account from flooding a
          broker. When a limit applies, the interface says which one it is and when it
          resets. The operator of an instance can change every number below.
        </p>
        <Card>
          <CardContent>
            <h3 className="font-heading font-medium">
              Defaults that ship with the software
            </h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {DEFAULT_LIMITS.map((limit) => (
                <div key={limit.label} className="flex flex-col gap-0.5">
                  <dt className="text-sm text-muted-foreground">{limit.label}</dt>
                  <dd className="font-heading text-xl font-semibold">{limit.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}
