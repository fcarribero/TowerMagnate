# Performance

## Runner load test

TM-114 measures how many running towers one server process can hold. The bench starts N copies of a mid-size tower in one `TowerRunner`, each with one connected client that watches the whole tower, and runs them at 1x speed for 10 minutes of real time. The code is in `apps/server/src/bench/runner-load.ts`, `load-towers.ts` and `load-stats.ts`.

The tower has 20 floors over columns 100 to 199: 90 offices on levels 2 to 10, 50 condos on levels 11 to 20 and two standard elevators that serve every floor. Before the load starts it is stepped to 07:00 of its second day, when it has 636 people, so the 10 minutes cover the morning rush and most of the working day.

The parts of the server that share the event loop with the runner run as they do in production. The `DeltaBroadcaster` sends a delta to each client every 200 ms with the whole tower in the viewport, and the autosave runs every 30 seconds. The autosave serializes each state but does not write to Postgres; `pnpm bench:snapshots` measures the database write.

Tick lag is how long after its due time a runner tick finishes. Ticks are due every 100 ms on a fixed schedule from the start of the run, so a process that falls behind shows lag that keeps growing. CPU is process CPU time over wall time, where 100% is one core fully busy.

### Running it

```bash
pnpm bench:runner-load --towers 30 --floors 20 --minutes 10
```

Other options are `--runs` (default 3), `--budget-ms` (default 100) and `--gate`, which makes the exit code 1 when the p95 lag scaled to the reference runner is over budget or the result is void. A result is the median of 3 runs. When p95 lag or CPU differ by more than 15% between runs, the result is void and 3 new runs are made, once.

A full measurement takes 30 minutes or more, so run it in CI. For a quick look on a shared machine, use `--minutes 0.5 --runs 1`. Numbers from a desktop are not comparable with the reference runner: a 30-second run with 30 towers on a Windows desktop (Ryzen 7 5800X, Node 22.14.0) gave a p95 lag of 232 ms, about three times the reference result.

### CI

The `Runner load` workflow (`.github/workflows/runner-load.yml`) runs the bench on `ubuntu-latest`. The 30-tower job has the gate. The 40-tower job is the margin run and only reports. The workflow runs on pull requests that change the runner, the tower socket or the bench, every Monday at 05:00 UTC, and on demand. Results also go to the job summary.

### Budget

30 towers of 20 floors at 1x for 10 minutes: tick lag p95 at most 100 ms on the reference runner. The reference runner is a GitHub Actions `ubuntu-latest` runner (4 vCPU, 16 GB) with an AMD EPYC 7763 and Node 22.

### Gate method (TM-245)

`ubuntu-latest` is a pool of machines with different CPUs, and the same code gives very different lag on them. Before TM-245, over the same commit range, the 30-tower p95 was 53 ms on an AMD EPYC 9V45, 68 to 79 ms on an EPYC 9V74 or a Xeon Platinum 8573C, and 91 to 106 ms on an EPYC 7763. A gate on the raw p95 passed or failed by which machine the job landed on.

The bench now times a fixed CPU workload in the same job, once before the runs and once after, and keeps the faster of the two. The workload (`apps/server/src/bench/cpu-speed.ts`) copies and serializes a block of plain data, which is what the runner and the broadcaster spend most of their time on. It uses no game code, so a change to the engine or the server does not move it. The slowdown is the calibration time over the reference calibration time, 33 ms on the EPYC 7763. The gate divides the median p95 lag by the slowdown and compares the result with the budget. The job summary shows the CPU model, the calibration time, the slowdown, the raw p95 and the scaled p95.

Calibration times on CI were 32.9 to 33.5 ms on three EPYC 7763 jobs and 25.7 ms on a Xeon Platinum 8573C. The calibration overstates the gap between CPU types a little: the 7763 calibrates 30% slower than the 8573C, while its tick lag was 17% to 21% higher. A faster runner therefore gets a slightly stricter gate, which is the safe side. When a new CPU type shows up in the pool, compare its scaled p95 with a 7763 run of the same commit before trusting it.

The reference is the 7763 because it is the slowest type seen so far. If GitHub changes the pool, rerun the bench on the new slowest type and update `REFERENCE_CALIBRATION_MS`.

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

### Over budget on develop (TM-245)

In January 2027 the gate failed on pull requests that only synced develop: TM-220 measured 105.8, 104.8 and 101.3 ms, and TM-35 100.7 ms. Both jobs ran on an EPYC 7763. The main cause was the runner CPU type: the same develop code passed at 76 to 79 ms on 9V74 runners the same day.

The code also got slower. On the desktop above, between the TM-114 head (`d469931`) and develop (`728e7c0`), a one-step `step` call went from 2.4 to 2.8 ms, and a two-step call plus snapshot and diff from 6.2 to 7.9 ms. The state without people grew from 46.6 to 50.4 KB because every unit now stores its evaluation grade (TM-103), and the daily grade system runs every step. On 7763 runners the process CPU for 30 towers went from 76.5% at TM-114 to 86.5%. TM-242 changed only the web client. TM-109 adds a fire roll once a day at 15:00, which costs nothing measurable while no fire burns.

A 20-second CPU profile with 30 towers on develop showed where the time went: 33% in `cloneState` (the `structuredClone` at the start of every `step` call), 20% in `diffSnapshots`, nearly all of it comparing views through `JSON.stringify`, and 7% in `sendUpdate`, which serialized each delta twice and the snapshot once to compare sizes. The engine systems themselves were 6%.

TM-245 replaced the JSON comparison with a structural comparison of plain data (`same-data.ts`) and serializes each delta once, sending the text it measured. Process CPU in the profile run fell from 95% to 79% of a core. On CI the 30-tower result on an EPYC 7763 went from 104.8 ms p95 and 86.5% CPU to 86.5 ms and 80.1% (runs 88.8, 86.5 and 84.6 ms). On a Xeon Platinum 8573C it was 71.8 ms (runs 69.5, 71.8 and 75.8 ms). A second EPYC 7763 job on the final commit gave 92.1 ms (runs 93.8, 92.8 and 90.7 ms) at 85.9% CPU, so two machines of the same type differ by about 7%. The calibration did not see that difference (33.3 and 33.2 ms), so the gate keeps about 8% of margin on the slowest CPU type.

The next saving is the state clone. The runner owns its states, so it could step them in place and skip `structuredClone`, but a snapshot or a save that holds a reference to the state would then see it change. That needs its own task with tests for those references.

## Release acceptance (TM-137)

TM-137 checks the TM-114 and TM-124 targets on the release build. The `Performance acceptance` workflow (`.github/workflows/perf-acceptance.yml`) runs every check on GitHub Actions `ubuntu-latest` (4 vCPU, 16 GB) with Node 22. It runs on demand and on pull requests that change the workflow file. Each result is the median of 3 runs.

### What "release build" means here

The server check builds the production image from `docker/prod/Dockerfile` (TM-88) and runs the runner load bench inside it, with `NODE_ENV=production` and the image's `node_modules`. The bench is bundled by `pnpm --filter @tower-magnate/server build:bench`, which uses the same esbuild settings as the server bundle, and mounted into the container. The image itself does not contain the bench.

The client check uses a production Vite build. The release build leaves out the stress page, so `pnpm --filter @tower-magnate/web build:perf` builds the same pages plus `perf.html` into `apps/web/dist-perf` (Vite mode `perf`), and `vite preview` serves it. The render code and the build settings are the ones the release uses.

The step budget check (`pnpm bench:full-tower`) runs the engine from source on Node 22. The engine has no separate release form: the server bundle inlines the same code.

### Server results

Runner load, 30 towers of 20 floors at 1x for 10 minutes, release image. Workflow run 42561895796, 2027-01-28, Node v22.23.4, 4 x AMD EPYC 9V74, 16 GB. CPU calibration 34.1 ms against the 33 ms reference, slowdown 1.03.

| Run | Tick lag p50 | Tick lag p95 | Max lag | CPU |
| --- | --- | --- | --- | --- |
| 1 | 44.8 ms | 83.7 ms | 179.3 ms | 78.6% |
| 2 | 48.1 ms | 84.3 ms | 157.3 ms | 78.3% |
| 3 | 43.7 ms | 84.6 ms | 175.0 ms | 78.1% |
| Median | 44.8 ms | 84.3 ms | | 78.3% |

The runs agree within 2%. The p95 lag scaled to the reference runner is 81.6 ms, within the 100 ms budget.

Step budget, section 9 of `engine-and-protocol.md`: one `step` call with `steps = 1` on a tower of 15,000 people, average under 5 ms, p95 under 8 ms and p99 under 15 ms. `pnpm bench:full-tower` builds 2,500 leased offices of 6 workers on 100 floors, with four zones of 25 floors, six standard elevators per zone and stairs between zones. It times every one-step call from 06:00 to 14:00 of the first weekday with commuters, 2,880 calls per run, including the state copy each call makes. It also times the same hours as one call. The first table is workflow run 42564837735, 2027-01-28, Node v22.23.4, 4 x Intel Xeon Platinum 8370C, before TM-249.

| Run | Average | p95 | p99 | Max | Per step in one call |
| --- | --- | --- | --- | --- | --- |
| 1 | 21.89 ms | 34.39 ms | 44.24 ms | 90.08 ms | 3.69 ms |
| 2 | 21.83 ms | 33.60 ms | 43.55 ms | 212.36 ms | 3.54 ms |
| 3 | 22.03 ms | 34.49 ms | 45.53 ms | 204.95 ms | 3.46 ms |
| Median | 21.89 ms | 34.39 ms | 44.24 ms | | 3.54 ms |

The runs agree within 3%. The p95 of 34.4 ms was about seven times the budget. The systems themselves fit: run as one call, the same hours cost 3.5 ms per step. The rest was the `structuredClone` at the start of every `step` call. At 08:00 the state of this tower is 2.05 MB as JSON, and on a Ryzen 7 5800X desktop one clone of it takes 26.6 ms. Runner ticks paid this clone too, as TM-245 found for 20-floor towers.

TM-249 removed the clone. A `step` call now copies the small parts of the state and shares units, the grid and the trip and unit ledgers with the state it was given until a system asks for a writable copy (`step-copy.ts`). Units are copied with `structuredClone`, so every unit keeps one object layout and the scans over all units stay as fast as before. The check that a kept transport graph still fits the state compares the inputs in place instead of building a key string, which took 2 ms per call on this tower. Workflow run 42586088231, 2027-02-01, Node v22.23.4, 4 x AMD EPYC 9V74:

| Run | Average | p95 | p99 | Max | Per step in one call |
| --- | --- | --- | --- | --- | --- |
| 1 | 4.35 ms | 13.07 ms | 19.85 ms | 30.38 ms | 3.14 ms |
| 2 | 4.25 ms | 12.70 ms | 18.73 ms | 36.72 ms | 3.11 ms |
| 3 | 4.55 ms | 13.40 ms | 18.95 ms | 36.33 ms | 3.13 ms |
| Median | 4.35 ms | 13.07 ms | 18.95 ms | | 3.13 ms |

The runs agree within 6%. The average is under the 5 ms budget, but the p95 is not. What is left is the cost of the systems on the busiest steps, mostly trek and the office routine at the morning peak, and TM-252 owns it. Before TM-252 the step budget job was blocking with interim limits of 7 ms average, 17.5 ms p95 and 27.5 ms p99. It is now blocking with the final limits: `pnpm bench:full-tower --gate --avg-ms 5 --p95-ms 8 --p99-ms 15 --system-p95-ms 2.5` fails when a median is over its limit, when the median p95 of trek or the office routine is over 2.5 ms, or when the p95 of the runs differs by over 15%. The limits apply to the raw numbers. The job log shows the CPU model and the raw medians.

TM-252 cut the peak cost of the trek system and the office routine: people beside a full queue share plans per destination group and forget only the plans that ride a queue that just filled, shaft keys and lobby heights are cached per pass, and the office routine scans venue units once per step. The bench now prints the cost per step of every system. The 15,000-person day state hash equals develop's. Workflow run 42687414824, 2027-02-05, Node v22.23.4, 4 x AMD EPYC 9V74:

| Run | Average | p95 | p99 | Max | Per step in one call |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.92 ms | 5.11 ms | 6.83 ms | 11.06 ms | 2.00 ms |
| 2 | 2.89 ms | 5.21 ms | 6.40 ms | 8.31 ms | 1.86 ms |
| 3 | 2.98 ms | 5.46 ms | 6.60 ms | 8.53 ms | 1.87 ms |
| Median | 2.92 ms | 5.21 ms | 6.60 ms | | 1.87 ms |

The median p95 of trek is 2.29 ms and of the office routine 0.68 ms, against a limit of 2.5 ms each. Workflow run 42644799549 landed on a 4 x Intel Xeon 6973P-C and measured a median average of 3.41 ms, p95 6.32 ms and p99 7.46 ms, with trek at 2.45 ms and the office routine at 0.75 ms at p95. The Xeon Platinum 8370C, the slowest type seen before this change, has not come up since. On the old code it ran about 25% slower than the 9V74 at p95, which would put trek near 2.9 ms there. The 2.5 ms trek limit has little room on a slow runner; the step budget job is blocking, so a red run on that CPU type is a limit problem and not a regression until a second run says otherwise.

The CPU type matters here, and the TM-245 calibration does not predict it. On the same code, the p95 was 9.27 ms on an AMD EPYC 9V45, 13.07 ms on an EPYC 9V74, 13.89 ms on an EPYC 7763 and 15.18 ms on a Xeon Platinum 8573C. The calibration ranks the same CPUs 9V45, 8573C, 7763, 9V74 from fastest to slowest (16.5, 25.7, 33.5 and 34.1 ms). Dividing by its slowdown gave the 9V45 a p95 of 18.57 ms, so the step gate does not scale. The slowest type seen is the Xeon Platinum 8370C: workflow run 42594672807 measured a median average of 5.96 ms, p95 16.34 ms and p99 26.01 ms there. The p95 limit of 17.5 ms and the p99 limit of 27.5 ms leave about 7% and 6% over it. The 7 ms average limit leaves about 17% over it. The limits of TM-252 are 5 ms average, 8 ms p95 and 15 ms p99, raw.

### Client results

The 100-floor stress tower with 3,000 people at 1x zoom (`perf.html` defaults), 30 minutes per run after a 15-second warm-up, Chromium from Playwright at 1920 x 1080. "Capped" runs use the browser's normal frame pacing. "Uncapped" runs pass `--uncapped` to `pnpm perf:stress`, which turns off vsync and the frame rate limit, so the frame time is what a frame costs and not the display interval. Frame cost is the p95 frame time in ms. Memory is the JS heap after a forced garbage collection, 15 seconds in and at the end.

CI, workflow run 42561895796, 2027-01-28, `ubuntu-latest`, headless Chromium:

| Run | Frames | fps | p95 frame | Max draw calls | Heap growth |
| --- | --- | --- | --- | --- | --- |
| 1, capped | capped | 4.6 | 216.8 ms | 69 | 16.5 to 17.1 MB, 3.2% |
| 2, capped | capped | 8.0 | 133.4 ms | 69 | 16.5 to 17.2 MB, 4.1% |
| 3, capped | capped | 7.6 | 133.4 ms | 69 | 16.6 to 16.8 MB, 1.5% |
| 1, uncapped | uncapped | 4.6 | 222.5 ms | 69 | 16.5 to 17.0 MB, 2.7% |
| 2, uncapped | uncapped | 4.6 | 223.3 ms | 69 | 16.5 to 17.1 MB, 3.3% |
| 3, uncapped | uncapped | 8.2 | 138.4 ms | 69 | 16.5 to 17.2 MB, 4.5% |

Draw calls are 69 on every frame of every run, under the 200 limit. Heap growth over 30 minutes is 1.5% to 4.5% (median 3.3%), under the 5% limit.

The fps and frame times from CI do not measure the game. The runners have no GPU, so Chromium draws with its software renderer on the CPU, and the runs split into a group near 4.6 fps and a group near 8 fps, most likely runners with different CPUs. The runs differ by far more than 15%, so these timings are void.

Desktop, the same release build, headed Chromium on a Ryzen 7 5800X with a GPU and a 59 Hz display, Windows 10, 3 minutes per run:

| Run | Frames | fps | p95 frame | Max draw calls | Heap growth |
| --- | --- | --- | --- | --- | --- |
| 1 | uncapped | 337 | 4.6 ms | 69 | 2.4% |
| 2 | uncapped | 667 | 2.6 ms | 69 | 2.5% |
| 3 | uncapped | 671 | 3.1 ms | 69 | 2.4% |
| Short check | capped | 56.4 | 18.1 ms | 69 | 1.4% |

The median p95 frame cost is 3.1 ms, well inside the 16.7 ms a 60 fps frame allows. The first run disagrees with the other two by more than 15% because the desktop was busy with other work. The capped check shows the display limit: a 59 Hz display holds any page at about 56 fps, as QA found in TM-124. The TM-124 dev build measured 6.2 ms p95 uncapped on the same kind of machine, so the release build costs about half as much per frame.

The 60 fps line is not judged here. No reference machine with a GPU is defined yet, and the CI runner cannot draw at game speed without one. TM-248 will name the render reference machine and make frame cost the primary figure. Until then, this table records frame cost next to fps, and the result to compare against is the 3.1 ms p95 frame cost on the desktop.

### Summary

| Target | Result | Status |
| --- | --- | --- |
| 30 towers, p95 tick lag at most 100 ms, release image | 84.3 ms raw, 81.6 ms scaled | Met |
| One step of a 15,000-person tower, average under 5 ms, p95 under 8 ms, p99 under 15 ms | 2.9 ms average, 5.2 ms p95, 6.6 ms p99 (was 21.9, 34.4 and 44.2 ms) | Met |
| 100 floors, 3,000 people, draw calls under 200 | 69 | Met |
| Heap growth under 5% over 30 minutes | 3.3% median, 4.5% highest | Met |
| 60 fps at 1x zoom | p95 frame cost 3.1 ms on a desktop GPU; not measurable on CI | Not judged until TM-248 |
