# Performance verification

Functionality and privacy checks take priority over throughput. External sending
remains disabled during every benchmark. Database and worker measurements use
synthetic records in an isolated test schema; those results will be added when
the operational changes are verified.

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

## Public JavaScript

The completed public-interface pass reduced encoded JavaScript transfer from
190,430 to 156,202 bytes over three cold Chromium runs. All public content and
FAQ behavior remain available. The method and raw totals are documented in
[interface verification](interface-verification.md#measured-javascript-transfer).
