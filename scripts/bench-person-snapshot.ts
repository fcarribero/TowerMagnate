/**
 * TM-169 snapshot benchmark: serialize and restore a 20,000-person tower.
 * Run with `pnpm bench:person-snapshot`. Reports the median of 5 runs and fails over the budget.
 */
import {
  SNAPSHOT_BUDGET_MS,
  SNAPSHOT_PEOPLE,
  SNAPSHOT_RUNS,
  timeSnapshot,
  towerWithPeople,
} from '@tower-magnate/engine/testing';

const tower = towerWithPeople(SNAPSHOT_PEOPLE);
timeSnapshot(tower, 1);
const { serializeMs, restoreMs, bytes } = timeSnapshot(tower, SNAPSHOT_RUNS);

console.log(`node ${process.version}, ${SNAPSHOT_PEOPLE} people, ${(bytes / 1e6).toFixed(2)} MB`);
console.log(
  `median of ${SNAPSHOT_RUNS}: serialize ${serializeMs.toFixed(1)} ms, restore ${restoreMs.toFixed(1)} ms`,
);
const passed = serializeMs < SNAPSHOT_BUDGET_MS && restoreMs < SNAPSHOT_BUDGET_MS;
console.log(
  passed ? `PASS (budget ${SNAPSHOT_BUDGET_MS} ms)` : `FAIL (budget ${SNAPSHOT_BUDGET_MS} ms)`,
);
process.exitCode = passed ? 0 : 1;
