/**
 * Clause keys shared by legal rule versions and request templates.
 *
 * A legal rule version lists the clauses a letter may contain for that
 * jurisdiction, a template lists the clauses its body actually implements.
 * Keeping both sides on one catalogue makes drift visible in the unit tests.
 */

export interface TemplateClauseDefinition {
  key: string;
  description: string;
}

export const TEMPLATE_CLAUSES: readonly TemplateClauseDefinition[] = [
  {
    key: "request-identification",
    description: "Names the individual and states which kind of request this is.",
  },
  {
    key: "legal-basis",
    description: "States the legal basis taken from the applied legal rule version.",
  },
  {
    key: "identifier-list",
    description: "Lists the identifiers the user approved for matching.",
  },
  {
    key: "confirmation-request",
    description: "Asks for written confirmation of what the recipient actually did.",
  },
  {
    key: "scope-limitation",
    description: "Limits the request to the named individual and the listed identifiers.",
  },
  {
    key: "retention-exception-disclosure",
    description:
      "Asks which data is retained after the request and on which legal ground it is kept.",
  },
  {
    key: "verification-minimisation",
    description:
      "Asks for the least intrusive identity verification and refuses unnecessary documents.",
  },
  {
    key: "third-party-disclosure-list",
    description:
      "Asks to whom the data was disclosed or sold and whether recipients were informed.",
  },
  {
    key: "opt-out-sale-sharing",
    description: "Opts the individual out of sale and sharing of personal information.",
  },
  {
    key: "delete-act-platform-reference",
    description:
      "References the California deletion request platform for registered data brokers.",
  },
  {
    key: "direct-marketing-objection",
    description: "Objects to the use of the data for direct marketing.",
  },
  {
    key: "consent-withdrawal",
    description: "Withdraws consent for further collection, use or disclosure.",
  },
  {
    key: "restriction-of-processing",
    description: "Asks for processing to be restricted while the request is assessed.",
  },
  {
    key: "anonymisation-or-blocking",
    description:
      "Asks for anonymisation or blocking where deletion is not possible under the applicable law.",
  },
  {
    key: "deadline-reminder",
    description: "Reminds the recipient of the response date of the original request.",
  },
  {
    key: "escalation-notice",
    description:
      "States that the individual has decided to involve the competent authority.",
  },
  {
    key: "household-consent-statement",
    description: "Optional block stating that the sender acts for another adult.",
  },
] as const;

export const TEMPLATE_CLAUSE_KEYS: readonly string[] = TEMPLATE_CLAUSES.map(
  (clause) => clause.key
);

export function isKnownClause(key: string): boolean {
  return TEMPLATE_CLAUSE_KEYS.includes(key);
}
