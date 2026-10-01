# Performance verification

Functionality and privacy checks take priority over throughput. External sending
remains disabled during every benchmark. Database and worker measurements use
synthetic records in a newly created, isolated test schema. The harness refuses
instance databases and external transport, verifies complete record counts and
removes its schema after each run.

## Calendar boundaries

The response-target and report code finds the first instant of a local calendar
day, including DST and missing or repeated midnight offsets. The original binary
search constructed an ICU date formatter for every comparison. The implementation
now constructs one formatter per boundary calculation and reuses it for those
comparisons. It introduces no global cache, retained personal values or approximate
24-hour arithmetic.

Run `npm run benchmark:calendar -- baseline` and then
`npm run benchmark:calendar -- optimized`. The script writes non-personal JSON
to `.tmp/benchmarks/`. It performs three rounds at each size across UTC, Berlin,
New York, Apia and Kolkata, alternating March and October dates. The baseline
reference retains the original formatter allocation pattern; the workload uses
valid dates and the reference omits the final existence check. That small
difference favors the baseline. Functional tests separately exercise skipped
dates, repeated midnight, 23/25-hour days and the lower supported year boundary.

Measurements below are medians across the three rounds on Node 24.21.0 with ICU
78.3 in the shared development container. They measure calendar operations,
not whole requests or production response latency. CPU contention and native
allocator behavior can affect the results; peak RSS is descriptive, not a
memory limit or a leak test.

| Operations | Before total | After total | Before p50 / p95 | After p50 / p95 |
| ---------: | -----------: | ----------: | ---------------: | --------------: |
|        100 |     554.9 ms |     83.3 ms |   4.77 / 8.37 ms |  0.81 / 1.01 ms |
|      1,000 |   6,311.5 ms |    594.4 ms |   4.90 / 9.29 ms |  0.49 / 0.87 ms |
|     10,000 |  70,676.0 ms |  5,494.5 ms |  5.56 / 11.02 ms |  0.45 / 0.85 ms |

At 10,000 operations, the recorded peak RSS was 341.1 MB before and 96.0 MB
after. [Raw baseline](verification/performance/calendar-baseline.json) and
[raw optimized measurements](verification/performance/calendar-optimized.json)
include each round, heap deltas, runtime versions and the implementation hash.

## Database pages and complete generation

[`tests/performance/database.ts`](../tests/performance/database.ts) creates
100, 1,000 and 10,000 owned requests, the same number of foreign requests, one
encrypted snapshot per owned request, and matching audit rows. One long-lived
request has the full event count to stress its history. Other export categories
are exercised by integration tests; these scale fixtures emphasize requests,
snapshots, events and audit rather than every possible correspondence workload.

Each list/index case has 20 warm samples in three rounds; history has five,
and full report/export generation has three. Measurements include repository
calls and JSON serialization. They are not HTTP latency or a production SLO.
The legacy reference reproduces broad list and unbounded history reads on the
current schema; it is not an entire old application build. Baseline and optimized
runs used Node 24.21.0 and PostgreSQL 16 in the shared development container.

| Owned requests | Deep page before p50 / p95 | Deep page after p50 / p95 | Full masked export before p50 / p95 | Full masked export after p50 / p95 | Export queries before → after |
| -------------: | -------------------------: | ------------------------: | ----------------------------------: | ---------------------------------: | ----------------------------: |
|            100 |            6.56 / 11.32 ms |            5.96 / 7.74 ms |                  206.79 / 235.59 ms |                 167.20 / 182.00 ms |                     156 → 136 |
|          1,000 |             7.16 / 9.68 ms |           6.22 / 13.49 ms |                  831.11 / 977.83 ms |                 641.81 / 758.13 ms |                     354 → 222 |
|         10,000 |           20.45 / 44.33 ms |          12.23 / 17.81 ms |            10,067.22 / 10,477.46 ms |             5,135.66 / 5,399.65 ms |                 2,335 → 1,014 |

The export keeps identical output sizes at every fixture size, including
19,578,847 bytes at 10,000 requests. Assertions verify every request and snapshot,
masking and zero outbound email. Internal batches increase from 100 to 250;
user-facing pages remain 25 by default with a maximum of 100. Masked generation
no longer retrieves private message/identifier fields it does not use. Sensitive
exports retain their confirmed, encrypted, complete content; a 505-record
integration case verifies both modes across the new batch boundary.

Purpose-specific projections and pagination already delivered the larger payload
gain: a 100-row request list falls from 285,301 to 21,536 serialized bytes at
10,000 records, with three queries in either case. A 25-row default returns 5,486
bytes. Private detail plus 25 events returns 12,239 bytes, versus 4,975,644 for
unbounded history. Its median is 24.44 ms versus 452.26 ms, with 14 queries versus
five: explicit private authorization and separate bounded reads carry overhead
at small sizes and keep large histories predictable.

### Index selection and results that were not wins

The cursor retains its timestamp/id predicate and adds a redundant timestamp
upper bound. Together with `(userId, createdAt, id)`, PostgreSQL can avoid
filtering every newer row. A counterbalanced index-on/off experiment at 10,000
requests improved each round's median: 13.45→11.37, 14.60→10.56 and
16.24→15.74 ms. The pooled medians are 14.87→12.52 ms. The recorded deep-page
plan filters one row rather than 9,000. At 100 rows PostgreSQL still chooses a
sequential scan; the index is not a universal small-table speedup.

Full JSON reports always include all records. Mixed-workload medians before/after
were 132.38/110.94 ms, 242.21/270.39 ms and 1,397.55/1,753.42 ms at the three
sizes. Their query counts remain 93, 138 and 570 and their output sizes match.
To investigate the slower large result, a separate three-round, counterbalanced
full-generation experiment swapped no extra index, the page index and
`(userId, id)`. Medians were 1,338.28, 1,366.94 and 1,296.19 ms; individual rounds
did not consistently favor the second index. It is not retained. The page index
is retained for its repeatable list benefit; no overall report speedup is claimed.

Audit verification's stable snapshot and 250-row pages use more queries than the
old unbounded read: 88 versus one at 10,000 rows, and 561 versus 409 ms in this
run. The bounded read, retained-prefix proof and lease-fenced publication are
correctness decisions. They are not presented as a latency optimization.

At 10,000 records the full-export observed process RSS peaks were 534.5 MB before
and 530.8 MB after. RSS is sampled every 5 ms and after operations, and includes
the warmed fixture/process. Native allocations and GC affect it; this is neither
a precise per-operation peak nor evidence of a memory reduction or leak test.

### Bounded worker concurrency

The same harness runs 100 jobs per round with one, two and four independent claim
loops. Each uses the real claim, lease and completion paths with a synthetic
bounded database-read handler. Every job completes once; no running/failed/retry
work or outbound message remains. These medians are jobs per second:

| Owned requests | One loop | Two loops | Four loops |
| -------------: | -------: | --------: | ---------: |
|            100 |     79.6 |     152.4 |      245.6 |
|          1,000 |     49.9 |     108.8 |      143.1 |
|         10,000 |     49.6 |      98.5 |      108.9 |

This demonstrates scaling of the existing fenced worker design for bounded reads;
it does not predict provider, PDF, retention or large encrypted-export throughput.
The default remains one task per worker. Add processes only with shared storage,
database capacity and measured memory headroom; the four-loop large fixture has
little benefit over two. No speculative intra-worker concurrency is introduced.

### Reproduction and raw evidence

Run `npm run benchmark:database -- optimized` under a test environment with a
new `bm_benchmark_` schema in a database whose name ends in `_test`, mock email,
memory storage and sending disabled. Run `-- report-index` for the separate
index experiment. Environment validation must pass normally; no build bypass is
used. The label selects an artifact name and experiment, not an automatic code
rollback. Repeating the historical baseline requires its matching source state;
each artifact records a hash of the measured files.

[Baseline](verification/performance/database-baseline.json),
[optimized](verification/performance/database-optimized.json) and
[report index experiment](verification/performance/database-report-index.json)
contain samples, query counts, result sizes, memory observations, plans, runtime
versions and source hashes. They contain no identifiers, SQL parameters,
credentials, message content or storage keys. Timing variation, small sample
counts for generation and shared-host measurements limit extrapolation.

## Public JavaScript

The completed public-interface pass reduced encoded JavaScript transfer from
190,430 to 156,299 bytes over three cold Chromium runs. All public content and
FAQ behavior remain available. The method and raw totals are documented in
[interface verification](interface-verification.md#measured-javascript-transfer).
