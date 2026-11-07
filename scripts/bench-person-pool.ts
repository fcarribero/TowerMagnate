/**
 * TM-32 pool benchmark: one step over 20,000 idle people, and the heap the pool takes.
 * Run with `pnpm bench:people`. A run is the median of SAMPLES_PER_RUN timings of
 * STEPS_PER_SAMPLE steps through the engine; the result is the median of 3 runs, void if
 * they differ by over 15%.
 */
import type { TowerState } from '@tower-magnate/shared';
import {
  addPeopleForUnit,
  createEngine,
  createPeopleSystem,
  createTower,
  peopleCount,
} from '@tower-magnate/engine';

const PEOPLE = 20_000;
const STEPS_PER_SAMPLE = 2_000;
const SAMPLES_PER_RUN = 7;
const RUNS = 3;
const STEP_BUDGET_MS = 0.3;
const HEAP_BUDGET_MB = 40;
const RUN_TOLERANCE = 0.15;

const collectGarbage = (globalThis as { gc?: () => void }).gc;

function heapUsedMb(): number {
  collectGarbage?.();
  const memory = process.memoryUsage();
  return (memory.heapUsed + memory.arrayBuffers) / (1024 * 1024);
}

/** 3,333 offices of 6 workers and one double room of 2 guests: 20,000 people. */
function towerWithPeople(): TowerState {
  const state = createTower(20261124);
  const offices = Math.floor(PEOPLE / 6);
  for (let index = 1; index <= offices; index++) {
    const id = `u${index}`;
    state.units[id] = { id, type: 'office', x: 0, level: 2, name: null };
    addPeopleForUnit(state, id);
  }
  const roomId = `u${offices + 1}`;
  state.units[roomId] = { id: roomId, type: 'double-room', x: 0, level: 3, name: null };
  addPeopleForUnit(state, roomId);
  return state;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

function spread(values: number[]): number {
  return (Math.max(...values) - Math.min(...values)) / Math.min(...values);
}

const engine = createEngine({
  commandHandlers: {},
  systems: [createPeopleSystem(() => undefined)],
});

const heapBefore = heapUsedMb();
let tower = towerWithPeople();
const poolHeapMb = heapUsedMb() - heapBefore;
if (peopleCount(tower.people) !== PEOPLE) {
  throw new Error(`Expected ${PEOPLE} people, built ${peopleCount(tower.people)}`);
}

function timeOneRun(): number {
  const samples: number[] = [];
  for (let sample = 0; sample < SAMPLES_PER_RUN; sample++) {
    const started = process.hrtime.bigint();
    tower = engine.step(tower, [], STEPS_PER_SAMPLE).state;
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    samples.push(elapsedMs / STEPS_PER_SAMPLE);
  }
  return median(samples);
}

timeOneRun();
const stepTimes = Array.from({ length: RUNS }, timeOneRun);

const stepMs = median(stepTimes);

const SINGLE_CALLS = 200;
const singleCallStarted = process.hrtime.bigint();
for (let call = 0; call < SINGLE_CALLS; call++) tower = engine.step(tower, [], 1).state;
const singleCallMs = Number(process.hrtime.bigint() - singleCallStarted) / 1e6 / SINGLE_CALLS;

const runsAgree = spread(stepTimes) <= RUN_TOLERANCE;
console.log(
  `node ${process.version}, ${PEOPLE} idle people, ${SAMPLES_PER_RUN}x${STEPS_PER_SAMPLE} steps per run`,
);
console.log(`runs (ms per step): ${stepTimes.map((time) => time.toFixed(4)).join(', ')}`);
console.log(`median step: ${stepMs.toFixed(4)} ms (budget ${STEP_BUDGET_MS} ms)`);
console.log(`one step() call of 1 step, with the state copy: ${singleCallMs.toFixed(3)} ms (info)`);
console.log(`runs agree within 15%: ${runsAgree ? 'yes' : 'no, result void, rerun'}`);
console.log(
  `pool heap: ${poolHeapMb.toFixed(2)} MB (budget ${HEAP_BUDGET_MB} MB)` +
    (collectGarbage ? '' : ' [run with --expose-gc for an exact figure]'),
);
const passed = runsAgree && stepMs <= STEP_BUDGET_MS && poolHeapMb <= HEAP_BUDGET_MB;
console.log(passed ? 'PASS' : 'FAIL');
process.exitCode = passed ? 0 : 1;
