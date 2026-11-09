/**
 * TM-114 runner load test: many mid-size towers running at 1x on one process, each with one
 * connected client that watches the whole tower. Run with `pnpm bench:runner-load`, options:
 *
 *   --towers 30   --floors 20   --minutes 10   --runs 3   --budget-ms 100   --gate
 *
 * Tick lag is how long after its due time a runner tick finishes. Ticks are due every 100 ms on
 * a fixed schedule, so a process that falls behind shows growing lag. The delta broadcaster and
 * the 30-second autosave run on their own timers as they do in the server; the autosave
 * serializes the state but skips the database, which `pnpm bench:snapshots` measures.
 *
 * A result is the median of the runs. When p95 lag or CPU differ by more than 15% between runs
 * the result is void and the runs are repeated, up to MAX_ATTEMPTS times.
 *
 * CI runners come with different CPUs, and the same code shows twice the lag on the slowest of
 * them. A fixed CPU workload is timed before and after the runs, and the budget applies to the
 * p95 lag scaled to the reference runner by that time. With --gate the process exits with 1 when
 * the scaled p95 lag is over budget or the result stays void.
 */
import { cpus, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { appendFileSync } from 'node:fs';
import { serializeState } from '@tower-magnate/engine';
import type { TowerState } from '@tower-magnate/shared';
import { ConnectionRegistry, type GatewaySocket } from '../gateway';
import { TICK_INTERVAL_MS, TowerRunner, type TowerStore } from '../runner';
import { DeltaBroadcaster, Viewports } from '../tower-socket';
import { calibrateCpu, normalizeLag, REFERENCE_CALIBRATION_MS, slowdownFactor } from './cpu-speed';
import { combineRuns, summarizeTicks, type LoadResult, type LoadRun } from './load-stats';
import { livedInTower, wholeTowerViewport } from './load-towers';

const MAX_ATTEMPTS = 2;

interface LoadOptions {
  towers: number;
  floors: number;
  minutes: number;
  runs: number;
  budgetMs: number;
  gate: boolean;
}

/** A client socket that only counts what it is sent. */
class CountingSocket implements GatewaySocket {
  bytes = 0;
  messages = 0;

  send(data: string): void {
    this.bytes += data.length;
    this.messages += 1;
  }
  ping(): void {}
  terminate(): void {}
  close(): void {}
  on(): this {
    return this;
  }
}

function readOptions(): LoadOptions {
  const { values } = parseArgs({
    options: {
      towers: { type: 'string', default: '30' },
      floors: { type: 'string', default: '20' },
      minutes: { type: 'string', default: '10' },
      runs: { type: 'string', default: '3' },
      'budget-ms': { type: 'string', default: '100' },
      gate: { type: 'boolean', default: false },
    },
  });
  return {
    towers: Number(values.towers),
    floors: Number(values.floors),
    minutes: Number(values.minutes),
    runs: Number(values.runs),
    budgetMs: Number(values['budget-ms']),
    gate: values.gate,
  };
}

function memoryStore(template: TowerState): TowerStore {
  return {
    load: () => Promise.resolve(structuredClone(template)),
    save: (_towerId, state) => {
      serializeState(state);
      return Promise.resolve();
    },
  };
}

/** Calls `tick` on a fixed 100 ms schedule until `durationMs` passes and returns each tick's lag. */
async function tickOnSchedule(tick: () => void, durationMs: number): Promise<number[]> {
  const lags: number[] = [];
  const startedAt = performance.now();
  for (let index = 1; index * TICK_INTERVAL_MS <= durationMs; index++) {
    const dueAt = startedAt + index * TICK_INTERVAL_MS;
    const wait = dueAt - performance.now();
    if (wait > 0) await sleep(wait);
    tick();
    lags.push(performance.now() - dueAt);
  }
  return lags;
}

async function loadRun(options: LoadOptions, template: TowerState): Promise<LoadRun> {
  const runner = new TowerRunner({ store: memoryStore(template) });
  const registry = new ConnectionRegistry();
  const viewports = new Viewports();
  const broadcaster = new DeltaBroadcaster({ runner, viewports });
  const viewport = wholeTowerViewport(options.floors);
  const sockets: CountingSocket[] = [];

  for (let index = 1; index <= options.towers; index++) {
    const towerId = `load-${index}`;
    const socket = new CountingSocket();
    sockets.push(socket);
    await runner.resume(towerId);
    registry.add(socket, { userId: `user-${index}`, towerId });
    viewports.update(socket, viewport);
    const state = runner.stateOf(towerId) as TowerState;
    broadcaster.sendSnapshot(socket, broadcaster.snapshotFor(socket, towerId, state));
  }

  const stopDeltas = broadcaster.start(registry);
  const stopAutosave = runner.startAutosave();
  const cpuBefore = process.cpuUsage();
  const wallBefore = performance.now();
  const lags = await tickOnSchedule(() => runner.tick(), options.minutes * 60_000);
  const wallMs = performance.now() - wallBefore;
  const cpu = process.cpuUsage(cpuBefore);
  stopDeltas();
  stopAutosave();
  await runner.shutdown();

  const sentBytes = sockets.reduce((sum, socket) => sum + socket.bytes, 0);
  const run = summarizeTicks(lags, cpu.user + cpu.system, wallMs);
  console.log(
    `  run: ${run.ticks} ticks, lag p50 ${run.p50LagMs.toFixed(1)} ms, p95 ${run.p95LagMs.toFixed(1)} ms, ` +
      `max ${run.maxLagMs.toFixed(1)} ms, CPU ${run.cpuPercent.toFixed(1)}%, ` +
      `sent ${(sentBytes / 1024 / (wallMs / 1000)).toFixed(0)} KB/s`,
  );
  return run;
}

async function measure(options: LoadOptions, template: TowerState): Promise<LoadResult> {
  let result: LoadResult | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const runs: LoadRun[] = [];
    for (let index = 0; index < options.runs; index++) {
      runs.push(await loadRun(options, template));
    }
    result = combineRuns(runs);
    if (result.runsAgree) return result;
    console.log(`Attempt ${attempt}: runs differ by more than 15%, result void.`);
  }
  return result as LoadResult;
}

function machine(): string {
  const cpu = cpus()[0]?.model ?? 'unknown CPU';
  const memoryGb = (totalmem() / 1024 ** 3).toFixed(0);
  return `${cpus().length} x ${cpu}, ${memoryGb} GB, Node ${process.version}`;
}

interface MachineSpeed {
  calibrationMs: number;
  slowdown: number;
}

/** The faster of two calibrations, so a burst of other work on the runner does not count. */
function machineSpeed(before: number, after: number): MachineSpeed {
  const calibrationMs = Math.min(before, after);
  return { calibrationMs, slowdown: slowdownFactor(calibrationMs) };
}

function report(
  options: LoadOptions,
  result: LoadResult,
  people: number,
  speed: MachineSpeed,
): string {
  const status = result.runsAgree ? '' : ' (void: runs differ by more than 15%)';
  const runs = result.runs
    .map((run) => `${run.p95LagMs.toFixed(1)} ms / ${run.cpuPercent.toFixed(1)}%`)
    .join(', ');
  return [
    `### Runner load: ${options.towers} towers of ${options.floors} floors, ${options.minutes} min at 1x`,
    '',
    `- Machine: ${machine()}`,
    `- People per tower at start: ${people}`,
    `- CPU calibration: ${speed.calibrationMs.toFixed(1)} ms, reference ${REFERENCE_CALIBRATION_MS} ms, ` +
      `slowdown ${speed.slowdown.toFixed(2)}`,
    `- Tick lag p50: ${result.p50LagMs.toFixed(1)} ms, p95: ${result.p95LagMs.toFixed(1)} ms${status}`,
    `- Tick lag p95 on the reference runner: ${normalizeLag(result.p95LagMs, speed.slowdown).toFixed(1)} ms`,
    `- CPU: ${result.cpuPercent.toFixed(1)}% of one core`,
    `- Runs (p95 lag / CPU): ${runs}`,
    `- Budget: p95 lag on the reference runner at most ${options.budgetMs} ms`,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const options = readOptions();
  console.log(`Preparing a ${options.floors}-floor tower...`);
  const template = livedInTower(options.floors);
  const people = template.people.id.length;
  console.log(
    `${options.towers} towers, ${people} people each, ${options.runs} runs of ${options.minutes} min`,
  );

  const calibrationBefore = calibrateCpu();
  const result = await measure(options, template);
  const speed = machineSpeed(calibrationBefore, calibrateCpu());
  const text = report(options, result, people, speed);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);

  if (!options.gate) return;
  if (!result.runsAgree) {
    console.error('The result is void: runs kept differing by more than 15%.');
    process.exitCode = 1;
  } else if (normalizeLag(result.p95LagMs, speed.slowdown) > options.budgetMs) {
    console.error(
      `Tick lag p95 on the reference runner is over the ${options.budgetMs} ms budget.`,
    );
    process.exitCode = 1;
  }
}

await main();
