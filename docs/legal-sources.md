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

- `deadlineDays` and legacy day-count JSON are compatibility fields, not an
  executable timing policy. Calendar-month rules therefore have no day count.
  A versioned `deadlineRule.policy` starts from receipt or a clearly labelled
  submission estimate. Unsupported legacy timing produces no invented date.
- An unverified period or incomplete business-day/holiday calendar remains an
  estimate. Extensions and pauses are not applied automatically. See
  [response-targets.md](response-targets.md) for sources, provenance and upgrades.

## Jurisdictions

### California (`US-CA`)

| Rule                              | Rights claimed                                  | Deadline                                           | Confidence |
| --------------------------------- | ----------------------------------------------- | -------------------------------------------------- | ---------- |
| `ccpa-consumer-rights`            | deletion, access, correction                    | 45 calendar days, one 45 day extension with notice | LOW        |
| `ccpa-opt-out-sale-sharing`       | opt out of sale and sharing                     | 15 business days                                   | LOW        |
| `ca-delete-act-drop`              | manual official DROP deletion/status workflow   | platform cycles; no ordinary letter deadline       | LOW        |
| `us-voluntary-broker-suppression` | direct suppression under the recipient's policy | no fixed period                                    | LOW        |

Sources: [California Attorney General, CCPA](https://oag.ca.gov/privacy/ccpa),
[California Privacy Protection Agency](https://cppa.ca.gov/),
[CPPA data broker registry](https://cppa.ca.gov/data_broker_registry/),
[California Attorney General, data brokers](https://oag.ca.gov/data-brokers).

Escalation goes to the California Privacy Protection Agency or the California
Attorney General, and only if the individual decides to escalate.

The DROP workflow was reviewed on **2026-09-30** against
[CalPrivacy's consumer instructions](https://privacy.ca.gov/drop/how-drop-works/)
and [broker-processing guidance](https://privacy.ca.gov/drop-for-data-brokers/process-drop-requests/).
It is restricted to the `DROP` channel and never applied to a direct email or
ordinary broker form. Its approved text is a private action plan; the individual
performs residency verification, chooses the broker scope and submits on the
official platform. Brokermogger does not collect additional platform identity
fields, log in, store the private DROP ID or submit on the person's behalf.

Broker processing began August 1, 2026, with recurring access at least every
45 days. Consumer guidance describes up to 90 days for initial status reporting.
These are separate platform requirements; no universal 45-day response deadline
is attached to a letter. Exceptions and nonmatching records can limit results.
Checking an existing status is recorded as correspondence, not another submission.
Voluntary direct suppression remains separate from erasure and CCPA sale/sharing
opt-out. Operator-authored rules can explicitly limit their applicable channels.

### US state packs

California and 19 other states have explicit packs: CO, CT, DE, FL, IN, IA, KY,
MD, MN, MT, NE, NH, NJ, OR, RI, TN, TX, UT and VA. The state catalogue lives in
[`us.ts`](../lib/jurisdiction/us.ts). Each entry links its enacted statute or
official attorney-general guidance, states its adult-consumer applicability
conditions, records the actual review date **2026-09-30**, and remains `LOW`
confidence with legal review required. All state/DC choices remain available;
unsupported locations resolve to an explicitly voluntary pack.

Every supported state also retains a separate voluntary suppression option. A
state pack does not remove the option to use a broker's published display/use
restriction policy, and this option does not borrow a statutory erasure claim.

The initial response policies use receipt-based calendar days, with conditional
extensions requiring notice. They do not automatically apply a pause, extension,
appeal deadline or holiday rule. Important differences remain explicit:

- Iowa uses 90 days plus a possible 45-day extension, does not supply a correction
  right, limits deletion to provided data, and limits this opt-out to sale.
- Florida's qualifying-controller test requires more than $1 billion in revenue
  and the specified additional business condition; its extension is 15 days.
- Indiana's copy or representative summary concerns previously provided data;
  correction also concerns provided data. A household invitation alone does not
  establish every state's agent-authority requirement.
- Utah's provided-data deletion remains narrower than full erasure. Its correction
  right commenced July 1, 2026, under the enrolled HB 418. Opt-out language does
  not invent a profiling right there.
- Texas and Nebraska use small-business scope tests; Tennessee also has a revenue
  threshold. Montana and Connecticut use their amended thresholds. Rhode Island's
  consumer-rights scope differs from its wider website-notice requirement.

Enacted replacements are scheduled using their jurisdiction's effective instant:
Connecticut October 1, 2026; Delaware and Utah January 1, 2027. They remain
unavailable before then, including when the catalogue cache is already warm.
Connecticut's future public-profile deletion provisions are distinct from its
later central platform and registry dates. Delaware's final HB 380 as amended
is read alongside the future compiled code: unchanged correction/deletion
clauses are not treated as repealed merely because that compiled presentation
omits them. These details and primary sources remain in each version's notes.

### Other United States (`US-OTHER`)

| Rule                          | Rights claimed                              | Deadline | Confidence |
| ----------------------------- | ------------------------------------------- | -------- | ---------- |
| `us-broker-voluntary-opt-out` | opt out and suppression, no statutory right | none     | LOW        |

Sources:
[FTC privacy and security guidance](https://www.ftc.gov/business-guidance/privacy-security).

**There is no uniform federal deletion right in the United States.** The former
generic `us-state-privacy-rights` seed is retired on upgrade. Its historical rows
remain intact; it cannot lend another state's rights to an unsupported location.
Operator-authored entries are preserved for their operator's review.

The voluntary rule exists for the case where no statutory basis can be
established. It claims no legal right, asserts no deadline and tells the user
that a refusal is lawful. Escalation is described honestly: there is no
guaranteed regulator route, and the state attorney general is the only realistic
address.

### EU/EEA country packs

| Rule                                    | Rights claimed                                                             | Deadline                                            | Confidence |
| --------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------- | ---------- |
| `gdpr-access-rectification-erasure`     | access (Art. 15), rectification (Art. 16), erasure (Art. 17)               | one month, plus two further months under Art. 12(3) | MEDIUM     |
| `gdpr-objection-and-consent-withdrawal` | objection (Art. 21), restriction (Art. 18), consent withdrawal (Art. 7(3)) | one month, same extension                           | MEDIUM     |

All 27 EU countries and Iceland, Liechtenstein and Norway have their own
jurisdiction record and both rules above. The rules share one GDPR definition;
country codes, authority names and routes are explicit in
[`eea.ts`](../lib/jurisdiction/eea.ts). Germany's original rule keys and historical
version references remain intact. A missing pack never borrows Germany's authority.

Reviewed on **2026-09-30** against the
[EDPB individual-rights guide](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en),
[GDPR text](https://eur-lex.europa.eu/eli/reg/2016/679/oj) and the
[EDPB authority directory](https://www.edpb.europa.eu/about-edpb/our-members_en).
The shared EU baseline applies from 2018-05-25; the EEA EFTA baseline applies from
2018-07-20, as recorded by [EFTA](https://www.efta.int/media-resources/news/general-data-protection-regulation-gdpr-entered-force-eea).

Escalation is a complaint to the competent supervisory authority under
Article 77. Each pack points to its country's authority or competence directory.
Germany has divided state/federal supervision; BfDI is not automatically the
supervisor of a private broker. Austria also has special parliamentary competence.
Cross-border cases can involve another lead authority. The directory, rather than
an assumed complaint endpoint, is the source where an authority site could not be
retrieved. Brokermogger never files the complaint.

The response policy uses one calendar month from receipt, with month-end and
non-working-day handling. Public-holiday coverage requires separate review;
dispatch-based dates remain estimates. Erasure has
exceptions under Article 17(3), a controller may refuse manifestly unfounded or
excessive requests under Article 12(5), and whether the recipient is a
controller for the data in question has to be assessed per case.
These packs cover the common GDPR baseline, not every national derogation or
sector law. Suppression limits a use such as marketing and does not establish
erasure. No country holiday calendar is invented, and legal review stays required.

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

| Rule                              | Rights claimed                                                                  | Deadline     | Confidence |
| --------------------------------- | ------------------------------------------------------------------------------- | ------------ | ---------- |
| `india-voluntary-privacy-request` | voluntary summary access, correction and deletion before statutory commencement | none claimed | LOW        |
| `dpdp-data-principal-rights`      | statutory summary access, correction and erasure from May 13, 2027              | none claimed | LOW        |

Reviewed on **2026-09-30** against the
[commencement Gazette, G.S.R. 843(E)](https://egazette.gov.in/WriteReadData/2025/267647.pdf),
[final Rules, G.S.R. 846(E)](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)
and the [official implementation timeline](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2261823&lang=1&reg=3).

Sections 11–17 commence eighteen months after November 13, 2025: **May 13, 2027**
in India. Until then the pack makes a voluntary request under the recipient's
policy, without statutory claims or an assumed regulator remedy. Untouched
premature seed versions are archived without rewriting historical messages.
The future pack becomes available at the recorded commencement instant.

Rule 14 concerns the fiduciary's published method, including previous consent
and applicable identifiers. Summary access is not a full copy of every record.
Rule 14(3)'s maximum 90-day period concerns grievance redressal; it is not used
as an initial access/correction/erasure deadline. Grievance escalation requires
the applicable process and the individual's own action.

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

Seeds append changed content as new versions and preserve immutable history.
Operator-managed rules receive draft updates. Use the legal-rule editor to save,
preview and publish a reviewed correction; future-effective versions wait for
their recorded effective instant. See [catalogue-versions.md](catalogue-versions.md)
and [operator-catalogue.md](operator-catalogue.md).
