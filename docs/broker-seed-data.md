# Broker seed data

Every broker record that ships with Brokermogger is **fictional demo data**.
There are no real company names, no real domains and no real contact addresses
in `prisma/seeds/data/brokers.ts`. Every domain ends in `.example` or
`.invalid`, both of which are reserved and cannot be registered, so a
misconfigured instance cannot accidentally contact anyone.

## Why the shipped data is invented

1. **No scraping.** Brokermogger does not crawl broker sites, does not bypass
   CAPTCHAs or logins and does not violate terms of service. A seed built from
   scraped pages would contradict that rule on the first line of the project.
2. **No copying of third party databases.** Broker lists compiled by other
   projects or vendors are their work and often carry licence terms. Shipping a
   copy inside an AGPL project would be both a licence problem and free riding.
3. **No unverified claims about real companies.** A record says what a company
   collects, how it answers requests and how trustworthy its contact address is.
   Publishing that about a named company without verifying it is a factual claim
   the project cannot stand behind, and a wrong claim can damage a real business
   as well as the user who relies on it.
4. **A demo must be safe to run.** Anyone can clone the repository and run
   `npm run db:seed`. If the seed contained real addresses, an experiment would
   turn into unsolicited mail to real privacy teams.

The demo data therefore exists to show the product: the categories, the
verification ladder, the coverage model, the hard cases and the states the user
interface has to render. It is not a broker directory.

## What the data set contains

- 44 brokers spread over all eight categories, at least four per category.
- Fictional coverage rows for the original eight example jurisdictions, including at least ten brokers each
  for California and Germany and at least five each for Brazil, India, Australia
  and Singapore.
- Every verification status from `UNVERIFIED` to `RESPONSE_BEHAVIOR_VERIFIED`,
  plus one `DEPRECATED` and one `INACTIVE` record.
- Three `RESTRICTED` records that stand for the hard cases: a credit bureau like
  source, a court and public record source and a fraud risk source. They all
  require manual review and their notes explain why.
- Aliases, contact methods (email, web form, privacy portal, postal, one API
  placeholder and one deletion platform placeholder for a California broker) and
  at least one `BrokerSeedSource` per record with `sourceType = DEMO_FICTIONAL`.

Every seed source carries the same warning: the record is illustrative and must
be replaced with independently verified data before it is used to contact
anyone.

## Safety switches

| Field                      | Value in demo data         | Meaning                                                         |
| -------------------------- | -------------------------- | --------------------------------------------------------------- |
| `isDemoData`               | always `true`              | The record is fictional and the seed owns it.                   |
| `productionSendingEnabled` | always `false`             | Nothing may be sent to this record.                             |
| `productionUnsafeFlag`     | `true` on 5 records        | Known to be unusable, for example a bounced or dormant contact. |
| `manualReviewRequired`     | mostly `true`              | A human has to look at the request before it can be approved.   |
| `riskTier`                 | `STANDARD` to `RESTRICTED` | Elevated and restricted tiers always force manual review.       |

`defineBroker()` in the data module sets `isDemoData` and
`productionSendingEnabled`, so the data list cannot switch either of them on.
The database enforces the same rule from the other side: the check constraint
`broker_production_sending_requires_verification` rejects
`productionSendingEnabled = true` unless the record is active, not flagged as
unsafe, not soft deleted, has a `sourceUrl`, has a `lastVerifiedAt` and has a
verification status of `CONTACT_VERIFIED`, `REQUEST_METHOD_VERIFIED` or
`RESPONSE_BEHAVIOR_VERIFIED`.

## Turning a record into production usable data

A maintainer promotes a record by verifying it, level by level. Each level adds
a claim the instance is willing to defend.

1. **`SOURCE_FOUND`** - you found the company's own privacy page. Set
   `sourceUrl` to that page and `lastVerifiedAt` to the day you looked at it.
   Record where the information comes from in a `BrokerSeedSource` row with a
   real `sourceType` (`OFFICIAL_PRIVACY_PAGE` or `PUBLIC_REGISTRY`) and
   `isDemo = false`.
2. **`CONTACT_VERIFIED`** - the privacy contact is confirmed from that source,
   not from a directory or from guesswork. Set the `BrokerContactMethod` to
   `isVerified = true` with `verifiedAt`, `verifiedBy` and a `sourceUrl`, and
   write in `verificationNote` how you confirmed it.
3. **`REQUEST_METHOD_VERIFIED`** - you know which channel the company actually
   accepts requests on and what it asks for. Fill `verificationRequirements`
   honestly, including whether an account or an identity document is demanded.
4. **`RESPONSE_BEHAVIOR_VERIFIED`** - you have observed real responses. Fill
   `knownResponseBehavior` with the typical response time, whether an
   autoresponder replies and the rejection reasons you have seen.
5. **Enable sending.** Set `isDemoData = false`, keep `productionUnsafeFlag`
   false, make sure `isActive` is true and only then set
   `productionSendingEnabled = true`. Sending additionally requires
   `ALLOW_EXTERNAL_SENDING=true` in the environment and the
   `sending.enabled_by_admin` system setting, and each individual request still
   needs the user's explicit approval.

Two more fields belong to the promotion:

- `confidenceScore` (0 to 100) should follow the verification level rather than
  optimism. The demo data uses roughly 10 to 20 for unverified records and 75 to
  85 for records with observed behaviour.
- `riskTier` stays `ELEVATED` or `RESTRICTED` whenever a request can expose the
  user, cannot legally succeed, or requires documents the product does not
  collect.

**The seed leaves your record alone once `isDemoData` is false.** The writer in
`prisma/seeds/brokers.ts` skips those rows and reports them as skipped in the
summary. As long as a record is demo data, the seed owns it: it refreshes every
field and removes aliases, contact methods, coverage rows and seed sources that
are no longer part of the shipped data.

## Importing your own verified data

The demo data is not meant to be edited into a production list. Keep your own
data separate so that `git pull` never fights with it.

1. Write your records as a JSON or CSV export of your own research, with one
   entry per broker and the same field names as `BrokerSeed` in
   `prisma/seeds/data/brokers.ts`.
2. Add a script under `scripts/` that reads your file and calls the same Prisma
   models the seed writer uses. Reuse the child row handling in
   `prisma/seeds/brokers.ts` as a template: upsert on `slug`, on
   `(brokerId, alias)`, on `(brokerId, type, value)` and on
   `(brokerId, jurisdictionId)` so that repeated imports stay idempotent.
3. Set `isDemoData = false` on everything you import. That is what keeps the
   demo seed from touching your rows, and it is also what makes the record
   eligible for production sending later.
4. Give every imported record at least one `BrokerSeedSource` row with the real
   source, the retrieval date and `isDemo = false`, so the origin of the claim
   stays visible in the admin area.
5. Decide per record whether you also want to delete the demo rows. Removing
   them is a plain delete by slug; keeping them is harmless because they cannot
   be used for sending.

If you would rather not run a script, the admin area can create and verify
brokers by hand. The same rules apply: a source, a verification date, a verified
contact and an explicit decision to enable sending.

## Re-running the seed

`npm run db:seed` is idempotent. Running it twice produces the same rows, the
second run reports every record as updated instead of created, and the counts
stay stable. Demo accounts are only created when `SEED_DEMO_USERS=true`.
