/**
 * Jurisdiction coverage.
 *
 * Each entry says what the product prepares and, in the same breath, what it
 * does not do there. No jurisdiction is described as solved, because none of
 * them is: the legal rules in this instance carry a source, a confidence level
 * and a review date, and uncertain rules are flagged before they are used.
 */
import { Section } from "@/components/marketing/section";
import { Card, CardContent } from "@/components/ui/card";

interface Coverage {
  place: string;
  prepares: string;
  limit: string;
}

const COVERAGE: readonly Coverage[] = [
  {
    place: "California, United States",
    prepares:
      "Prepares deletion and opt-out requests that refer to the CCPA and CPRA, including the request to stop the sale or sharing of personal information.",
    limit:
      "It cannot verify your identity on your behalf, and a broker can still refuse by claiming an exemption.",
  },
  {
    place: "Other United States states",
    prepares:
      "Prepares deletion, opt-out and suppression requests where a state law or the broker's own published policy provides for them.",
    limit:
      "Several states give no deletion right against data brokers at all. There the request is a voluntary ask and the broker may ignore it.",
  },
  {
    place: "Germany and the European Union",
    prepares:
      "Prepares erasure requests under Article 17 GDPR and objections under Article 21 GDPR, with the response deadline that the rule for the jurisdiction defines.",
    limit:
      "It does not lodge a complaint with a supervisory authority for you and does not judge whether an exemption applies to your case.",
  },
  {
    place: "United Kingdom",
    prepares:
      "Prepares erasure requests and objections under the UK GDPR and the Data Protection Act 2018.",
    limit:
      "It does not contact the Information Commissioner's Office for you, and escalation stays a manual decision.",
  },
  {
    place: "Brazil",
    prepares: "Prepares deletion and access requests that refer to the LGPD.",
    limit:
      "The shipped rules for Brazil are marked as needing legal review, and the broker directory contains few Brazilian entries.",
  },
  {
    place: "India",
    prepares:
      "Prepares erasure and correction requests that refer to the Digital Personal Data Protection Act.",
    limit:
      "Parts of that act are still being brought into force, so the rules ship with low confidence and are flagged for review.",
  },
  {
    place: "Australia",
    prepares:
      "Prepares correction requests and objections to direct marketing under the Privacy Act and the Australian Privacy Principles.",
    limit:
      "Australian law provides no general right to erasure, so a deletion request there is a voluntary ask.",
  },
  {
    place: "Singapore",
    prepares: "Prepares withdrawal of consent and access requests under the PDPA.",
    limit:
      "The PDPA has no general erasure right, so whether data disappears depends on the broker's own retention policy.",
  },
];

export function CountryCoverage() {
  return (
    <Section
      id="coverage"
      title="Where it works, and how far"
      description="The rule that applies is chosen per broker and per profile when a request is prepared. Every rule carries a source link, a confidence level and the date it was last reviewed."
    >
      <ul className="grid gap-4 md:grid-cols-2">
        {COVERAGE.map((entry) => (
          <li key={entry.place}>
            <Card className="h-full">
              <CardContent className="flex flex-col gap-2">
                <h3 className="font-heading font-medium">{entry.place}</h3>
                <p className="text-sm text-pretty text-muted-foreground">
                  {entry.prepares}
                </p>
                <p className="text-sm text-pretty text-muted-foreground">
                  <span className="font-medium text-foreground">
                    What it does not do:{" "}
                  </span>
                  {entry.limit}
                </p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
