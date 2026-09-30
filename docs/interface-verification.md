# Interface verification — 2026-09-30

This batch retains the existing blue/slate identity and system typography. It
repairs the shared mobile shell, simplifies repeated surfaces, establishes a
small spacing/radius vocabulary, makes request review readable, and completes
upload feedback and keyboard paths. It does not replace the product's navigation
or remove public sections, metrics or workflows.

## Visual comparisons

| Screen                | Before                                                      | After                                                                          |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Dashboard, 1440px     | [Original](verification/interface/dashboard-before.png)     | [Action queue and summaries](verification/interface/dashboard-after.png)       |
| Request review, 375px | [Original](verification/interface/review-mobile-before.png) | [Readable review and approval](verification/interface/review-mobile-after.png) |

Images contain only synthetic local fixtures. Exact messages are masked until
explicitly revealed. The capture helper creates a synthetic account through the
actual domain workflows if its previous fixture is unavailable, and refuses to
run outside the dedicated local browser schema with mock delivery.

## Responsive and accessibility checks

The capture covers 41 workspace, operator and public routes at 320, 375, 768,
1024 and 1440px: 205 images and geometry/heading/label checks. The baseline had
74 cases of unintended page overflow; the finished batch has none. Each settled
screen has one H1 and every native input has a name. Axe WCAG 2/2.1/2.2 AA scans
at 375px report zero violations on all 41 screens.

Keyboard checks cover navigation, account and profile menu focus restoration,
tab arrow/end navigation, table scrolling, and destructive-dialog cancellation.
The new dialog regression first reproduced focus returning to the page body;
it now returns to the invoking control and starts on Cancel.

All 41 routes also passed geometry and heading checks at a 720px CSS viewport
(equivalent to the available layout width of a 1440px desktop at 200% zoom), and
with CSS magnification at 200%. These are automation approximations of browser
zoom, not a claim of native browser-UI zoom or a manual screen-reader audit.

The manual Impeccable detector reported zero findings for the modified interface
targets. Visual inspection covered the dashboard and request-review desktop and
mobile layouts; correction rounds addressed verified overflow and keyboard
failures, without repeated aesthetic redesign.

## Production behavior and workflow checks

A fresh standalone production build passes all nine Chromium journeys. Every
journey checks unexpected CSP, hydration, console errors and warnings. This
includes actual magic-link sign-in/sign-out, household acceptance/revocation,
profile/identifier edits, invalid upload recovery, Unicode evidence downloads,
request editing/approval/manual submission/replies/reminders/escalation, reports,
notifications, exports, broker/settings editing and template publication.

The missing-route test verifies HTTP 404, one H1, private noindex metadata, HTML
language, runtime-correct Open Graph image origin, script nonces, a new nonce on
each navigation, and working return navigation. The sitemap no longer fabricates
modification timestamps. Production script protection remains strict even if
`APP_ENV=development`; CI runs its browser build under the strict policy.

Radix positioning uses explicitly permitted style attributes. Its scroll-lock
style elements receive the document nonce via lightweight client instrumentation.
Shared consent copy no longer imports server-only Zod validation into the browser.
No script `unsafe-inline` or `unsafe-eval` exception is enabled in production.

Type checking, lint, formatting, 379 unit/component tests, nine dashboard/evidence
integration regressions and the fresh production build pass. Earlier targeted
workflow regressions for this batch also passed. Dependency auditing reports
zero vulnerabilities after updating only the affected development dependencies.
The eventual delivery run repeats the full integration suite and remaining
production checks after legal coverage and operational work is complete.

The legal-rule editor expands coverage to 48 routes, including new-rule entry,
metadata, draft repair, saved previews, published history and template-version
screens. A fresh production capture produced 240 images at the same five widths:
zero page overflow, heading defects, unnamed controls, CSP errors and axe AA
violations. All 101 keyboard and zoom-approximation checks passed. The ten
production browser journeys pass; the legal journey was repeated after the
withdrawn-rule scheduling correction. Synthetic operator comparisons are
[legal administration](verification/interface/legal-rules-desktop.png) and
[draft editing at 375px](verification/interface/legal-draft-mobile.png).

## Measured JavaScript transfer

Three fresh Chromium contexts per build measured compressed Next JavaScript
resources after the public page settled. Each run returned the same byte totals:

| Measure                                      |  Before |   After | Change |
| -------------------------------------------- | ------: | ------: | -----: |
| Encoded JavaScript bytes                     | 190,430 | 156,202 | −18.0% |
| JavaScript transfer bytes, including headers | 194,330 | 158,902 | −18.2% |
| JavaScript files                             |      13 |       9 |     −4 |

[Raw totals and method](verification/interface/landing-transfer.json) are kept
with the images. Removing unused global providers and using native FAQ
disclosures accounts for the reduction. This measures network transfer, not
user latency or LCP. Larger database/worker benchmarks remain part of the plan.
