# Transport scenario and step time budget

TM-100 defines the scenario that measures engine step time: a 60-floor tower with 500 offices (3,000 people), 12 standard shafts in two banks that meet at level 30, and one weekday of 8,640 steps. The tower builder, the timing code and the report are in `packages/engine/src/testing/transport-scenario.ts`.

## Running it

```bash
pnpm bench:transport
```

The script takes several minutes. It prints the machine, the Node version, the average and p99 step time of each of the 3 runs, the average cost per step of each system, and the number of people on the move at 03:00. The result is the median of the 3 runs. Only the average step time has to agree between runs, within 15%; the p99 is not compared between runs. If the result fails for any reason, the whole benchmark is run once more and the second result stands. The exit code is 1 when a budget is missed, so a before and after comparison for a performance change is two runs of the same command.

The unit suite skips the scenario. The same check is also available as a Vitest test: `TM_PERF=1 pnpm --filter @tower-magnate/engine test transport-performance`.

## Budget

On the reference machine (GitHub Actions ubuntu-latest, 4 vCPU, 16 GB, Node 22):

- average step at most 1.0 ms
- p99 step at most 7 ms for now; TM-227 brings it back to 5 ms
- nobody on the move at 03:00

## Who owns the budget

TM-100 delivers the scenario and the measurement. The budget is currently missed (average 48 ms, p99 1,792 ms; office routine and trek systems dominate at rush hour). Meeting it is the job of TM-222, which uses `pnpm bench:transport` before and after each change and posts the per-system timings.
