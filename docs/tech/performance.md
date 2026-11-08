# Server performance

## Runner load test

TM-114 measures how many running towers one server process can hold. The bench starts N copies of a mid-size tower in one `TowerRunner`, each with one connected client that watches the whole tower, and runs them at 1x speed for 10 minutes of real time. The code is in `apps/server/src/bench/runner-load.ts`, `load-towers.ts` and `load-stats.ts`.

The tower has 20 floors over columns 100 to 199: 90 offices on levels 2 to 10, 50 condos on levels 11 to 20 and two standard elevators that serve every floor. Before the load starts it is stepped to 07:00 of its second day, when it has 636 people, so the 10 minutes cover the morning rush and most of the working day.

The parts of the server that share the event loop with the runner run as they do in production. The `DeltaBroadcaster` sends a delta to each client every 200 ms with the whole tower in the viewport, and the autosave runs every 30 seconds. The autosave serializes each state but does not write to Postgres; `pnpm bench:snapshots` measures the database write.

Tick lag is how long after its due time a runner tick finishes. Ticks are due every 100 ms on a fixed schedule from the start of the run, so a process that falls behind shows lag that keeps growing. CPU is process CPU time over wall time, where 100% is one core fully busy.

### Running it

```bash
pnpm bench:runner-load --towers 30 --floors 20 --minutes 10
```

Other options are `--runs` (default 3), `--budget-ms` (default 100) and `--gate`, which makes the exit code 1 when the p95 lag is over budget or the result is void. A result is the median of 3 runs. When p95 lag or CPU differ by more than 15% between runs, the result is void and 3 new runs are made, once.

A full measurement takes 30 minutes or more, so run it in CI. For a quick look on a shared machine, use `--minutes 0.5 --runs 1`. Numbers from a desktop are not comparable with the reference runner: a 30-second run with 30 towers on a Windows desktop (Ryzen 7 5800X, Node 22.14.0) gave a p95 lag of 232 ms, about three times the reference result.

### CI

The `Runner load` workflow (`.github/workflows/runner-load.yml`) runs the bench on `ubuntu-latest`. The 30-tower job has the gate. The 40-tower job is the margin run and only reports. The workflow runs on pull requests that change the runner, the tower socket or the bench, every Monday at 05:00 UTC, and on demand. Results also go to the job summary.

### Budget

30 towers of 20 floors at 1x for 10 minutes: tick lag p95 at most 100 ms. The reference machine is the GitHub Actions `ubuntu-latest` runner (4 vCPU, 16 GB) with Node 22.

### Results

Run of 2027-01-20, workflow run 42519972766, Node v22.23.4. The two jobs ran on different runner CPUs.

| Towers | Runner CPU | Tick lag p50 | Tick lag p95 | CPU | Runs (p95 / CPU) |
| --- | --- | --- | --- | --- | --- |
| 30 | 4 x AMD EPYC 9V74, 16 GB | 30.4 ms | 68.1 ms | 62.4% | 68.1 ms / 62.4%, 67.4 ms / 62.2%, 69.4 ms / 62.4% |
| 40 | 4 x AMD EPYC 7763, 16 GB | 67.7 ms | 122.2 ms | 96.0% | 122.2 ms / 96.0%, 122.2 ms / 95.3%, 125.9 ms / 96.4% |

The runs of each job agree within 3%. 30 towers are within budget, with a p95 lag of 68 ms. 40 towers are over budget at 122 ms p95 and use almost a whole core, so the margin is between 30 and 40 towers per process. Lag did not grow over either run, so neither process fell behind the game clock. Clients received about 50 KB/s each in both runs.

### Where the time goes

A 10-second probe on the desktop above, 30 towers:

- A runner tick took 84 ms on average. Each tower advances about one step per tick, and each call to the engine's `step` clones the whole state first. With one step per call, a step costs 1.9 ms; with 20 steps per call it costs 0.2 ms. A `structuredClone` of the 98 KB state takes about 2.9 ms.
- A broadcaster tick took 160 ms on average, or 5 ms per tower. Building the snapshot is 0.45 ms of that. The rest is spent in `needsFreshSnapshot`, `diffSnapshots` and the two `JSON.stringify` calls that compare the delta size with the snapshot size. The probe did not split these.

Both costs grow with the number of towers, so these two places are where more towers per process would come from.
