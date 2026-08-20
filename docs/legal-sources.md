# Legal sources for the seeded rules

**This is not legal advice.** Nothing in this repository was reviewed by a
lawyer. Every seeded legal rule version carries `requiresLegalReview = true`, a
source URL, a source title, a review date and a confidence value, and
`reviewedBy` says exactly what it is: "Brokermogger maintainers, unreviewed by
counsel". Before an instance is used for real requests, a person who is
qualified in the relevant jurisdiction has to check the wording, the deadlines
and the scope, and then publish a new version.

## How to read the confidence values

| Confidence | Used for               | Meaning                                                                        |
| ---------- | ---------------------- | ------------------------------------------------------------------------------ |
| `HIGH`     | nothing in the seed    | Reserved for content the project would defend publicly. Nothing qualifies yet. |
| `MEDIUM`   | GDPR and UK GDPR rules | The right itself is clear in the text; its application to a recipient is not.  |
| `LOW`      | every other rule       | The right, the deadline or the scope is uncertain. Always needs review.        |

A `LOW` version must always set `requiresLegalReview`. The database enforces
that with the check constraint
`legal_rule_version_low_confidence_requires_review`, so the invariant cannot be
bypassed by a direct write.

Two more conventions matter when reading the rules:

- `deadlineDays` is `null` whenever the law sets no fixed period. The product
  then schedules a courtesy follow up instead of asserting a date. It never
  invents a deadline to make the interface look tidier.
- `deadlineRule.verified` is `false` where the maintainers could not confirm the
  timing from a primary source. Those numbers are working assumptions.

## Jurisdictions

### California (`US-CA`)

| Rule                        | Rights claimed                                  | Deadline                                           | Confidence |
| --------------------------- | ----------------------------------------------- | -------------------------------------------------- | ---------- |
| `ccpa-consumer-rights`      | deletion, access, correction                    | 45 calendar days, one 45 day extension with notice | LOW        |
| `ccpa-opt-out-sale-sharing` | opt out of sale and sharing                     | 15 business days                                   | LOW        |
| `ca-delete-act-drop`        | deletion and suppression for registered brokers | 45 days, **unverified**                            | LOW        |

Sources: [California Attorney General, CCPA](https://oag.ca.gov/privacy/ccpa),
[California Privacy Protection Agency](https://cppa.ca.gov/),
[CPPA data broker registry](https://cppa.ca.gov/data_broker_registry/),
[California Attorney General, data brokers](https://oag.ca.gov/data-brokers).

Escalation goes to the California Privacy Protection Agency or the California
Attorney General, and only if the individual decides to escalate.

The Delete Act rule is deliberately conservative. Its risk notes state that
timing, eligibility, broker coverage and the behaviour of the official platform
must be verified against current California Privacy Protection Agency sources
before production use. Brokermogger does not operate, integrate with or speak
for the state platform, and a broker that is not registered in California is
very likely out of scope.

### Other United States (`US-OTHER`)

| Rule                          | Rights claimed                              | Deadline                                    | Confidence |
| ----------------------------- | ------------------------------------------- | ------------------------------------------- | ---------- |
| `us-state-privacy-rights`     | deletion, access, correction, opt out       | 45 days plus a 45 day extension, unverified | LOW        |
| `us-broker-voluntary-opt-out` | opt out and suppression, no statutory right | none                                        | LOW        |

Sources:
[FTC privacy and security guidance](https://www.ftc.gov/business-guidance/privacy-security),
[NCSL state privacy legislation](https://www.ncsl.org/technology-and-communication/state-laws-related-to-digital-privacy).

**There is no uniform federal deletion right in the United States.** The state
rule says so in its risk notes and states in its legal basis text that the
applicable state law has to be confirmed. Several states have no general
consumer privacy statute at all, thresholds differ and sector exemptions apply.

The voluntary rule exists for the case where no statutory basis can be
established. It claims no legal right, asserts no deadline and tells the user
that a refusal is lawful. Escalation is described honestly: there is no
guaranteed regulator route, and the state attorney general is the only realistic
address.

### Germany, representing the EU (`DE`)

| Rule                                    | Rights claimed                                                             | Deadline                                            | Confidence |
| --------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- | ---------- |
| `gdpr-access-rectification-erasure`     | access (Art. 15), rectification (Art. 16), erasure (Art. 17)               | one month, plus two further months under Art. 12(3) | MEDIUM     |
| `gdpr-objection-and-consent-withdrawal` | objection (Art. 21), restriction (Art. 18), consent withdrawal (Art. 7(3)) | one month, same extension                           | MEDIUM     |

Source:
[EUR-Lex, Regulation (EU) 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj).
Escalation is a complaint to the competent supervisory authority under
Article 77; the list of national authorities is published by the
[European Data Protection Board](https://www.edpb.europa.eu/about-edpb/about-edpb/members_en).

The one month period is modelled as 30 days for scheduling. Erasure has
exceptions under Article 17(3), a controller may refuse manifestly unfounded or
excessive requests under Article 12(5), and whether the recipient is a
controller for the data in question has to be assessed per case.

### United Kingdom (`GB`)

| Rule                                   | Rights claimed                                                              | Deadline                                     | Confidence |
| -------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- | ---------- |
| `uk-gdpr-access-rectification-erasure` | access, rectification, erasure                                              | one calendar month, extendable by two months | MEDIUM     |
| `uk-gdpr-objection-and-restriction`    | objection, restriction of processing, marketing opt out, consent withdrawal | same                                         | MEDIUM     |

Sources:
[ICO individual rights guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/),
[Data Protection Act 2018](https://www.legislation.gov.uk/ukpga/2018/12/contents).
Escalation is a complaint to the [ICO](https://ico.org.uk/make-a-complaint/),
which expects the individual to raise the matter with the organisation first.

Restriction is modelled as a suppression request: the organisation may keep the
data but must stop using it while the objection is assessed. Exemptions in the
Data Protection Act 2018 can limit access and erasure.

### Brazil (`BR`)

| Rule                       | Rights claimed                                                                    | Deadline                             | Confidence |
| -------------------------- | --------------------------------------------------------------------------------- | ------------------------------------ | ---------- |
| `lgpd-data-subject-rights` | confirmation of processing, access, correction, anonymisation, blocking, deletion | 15 days for the complete declaration | LOW        |
| `lgpd-consent-withdrawal`  | withdrawal of consent, marketing opt out                                          | none stated in the law               | LOW        |

Sources:
[Lei 13.709/2018 (LGPD)](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm),
[ANPD](https://www.gov.br/anpd/pt-br). Escalation goes to the ANPD.

Deletion under Article 18(IV) is limited to data that is unnecessary, excessive
or unlawfully processed, and Article 16 allows retention for legal obligations
and other listed purposes, so a full deletion cannot be promised. The 15 day
period comes from Article 19(II) and strictly speaking covers the complete
declaration about the processing; applying it to every request type is a
product simplification. The Portuguese text of the law prevails over any English
summary in this repository.

### India (`IN`)

| Rule                         | Rights claimed                                                                      | Deadline     | Confidence |
| ---------------------------- | ----------------------------------------------------------------------------------- | ------------ | ---------- |
| `dpdp-data-principal-rights` | access to a summary, correction, completion, updating, erasure, grievance redressal | none claimed | LOW        |

Source:
[MeitY data protection framework](https://www.meity.gov.in/data-protection-framework).

**Commencement and rule making status must be verified** before this rule is
used in production, which is why no deadline is asserted at all. Once the
applicable rules are confirmed, a maintainer should publish version 2 with a
verified period. Escalation runs through the data fiduciary's grievance
mechanism and then to the Data Protection Board of India, subject to the same
commencement caveat.

### Australia (`AU`)

| Rule                                   | Rights claimed                                         | Deadline                         | Confidence |
| -------------------------------------- | ------------------------------------------------------ | -------------------------------- | ---------- |
| `privacy-act-access-correction`        | access (APP 12), correction (APP 13)                   | 30 days, from regulator guidance | LOW        |
| `privacy-act-direct-marketing-opt-out` | direct marketing opt out and source disclosure (APP 7) | none, "a reasonable period"      | LOW        |

Sources:
[OAIC, Australian Privacy Principles quick reference](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-quick-reference),
[OAIC privacy complaints](https://www.oaic.gov.au/privacy/privacy-complaints).

**The Privacy Act 1988 does not give a general right to erasure.** No Australian
rule or template in this repository asks for deletion, and the unit tests fail
if one is added. Small business operators and several other categories fall
outside the Act, and APP 12.3 lists grounds for refusing access.

### Singapore (`SG`)

| Rule                     | Rights claimed                                   | Deadline                                    | Confidence |
| ------------------------ | ------------------------------------------------ | ------------------------------------------- | ---------- |
| `pdpa-access-correction` | access (s. 21), correction (s. 22)               | 30 days from regulator guidance, unverified | LOW        |
| `pdpa-withdraw-consent`  | withdrawal of consent (s. 16), marketing opt out | none, "reasonable notice"                   | LOW        |

Sources:
[PDPC, the Personal Data Protection Act](https://www.pdpc.gov.sg/overview-of-pdpa/the-legislation/personal-data-protection-act),
[PDPC complaints and reviews](https://www.pdpc.gov.sg/complaints-and-reviews).

**The PDPA does not provide a general right to be forgotten.** No Singapore rule
or template asks for erasure. The Act requires a response as soon as reasonably
possible; the 30 day figure comes from published regulator guidance and is
marked as unverified in `deadlineRule`. Access has statutory exceptions in the
Fifth Schedule, and business contact information is largely outside the Act.

## Identity verification and data minimisation

Every rule records what verification is realistically expected in
`verificationRequirements`. The product default is the same everywhere: ask for
the least intrusive verification that identifies the record, and do not provide
government identity documents, dates of birth or financial data unless the
recipient explains why they are strictly necessary. Where a law explicitly
limits verification, for example Article 12(6) GDPR, the templates say so.

## Changing a rule

Legal content is versioned, not edited. To change a rule:

1. Add a new `LegalRuleVersion` with the next version number, the new content, a
   fresh `lastReviewedAt`, the person or body who reviewed it in `reviewedBy`
   and honest `changeNotes`.
2. Publish it and mark the previous version as `SUPERSEDED`, so that requests
   already sent keep pointing at the exact wording they were generated from.
3. Keep `requiresLegalReview` true unless a qualified reviewer has actually
   signed off on the content, and only then consider raising the confidence.

The seed only owns version 1 of the rules it ships. It refreshes that version on
every run and never touches versions added by a maintainer.
