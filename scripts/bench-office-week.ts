/**
 * Ten-floor office tower, 90 offices, one game week. Run with `pnpm bench:office-week`.
 * Exits with 1 when the fastest of three runs takes 2000 ms or more.
 */
import {
  OFFICE_WEEK_BUDGET_MS,
  buildTower,
  fastestRunMillis,
  runScenario,
  tenFloorOfficeTowerPlan,
} from '@tower-magnate/engine/testing';

const { state: tower } = buildTower(tenFloorOfficeTowerPlan());
const elapsed = fastestRunMillis(() => runScenario({ tower, days: 7 }));

console.log(`10-floor office tower, 7 game days: ${elapsed.toFixed(0)} ms (fastest of 3)`);
console.log(`Budget: ${OFFICE_WEEK_BUDGET_MS} ms`);

const inBudget = elapsed < OFFICE_WEEK_BUDGET_MS;
if (!inBudget) console.error('Game week is over budget.');
process.exitCode = inBudget ? 0 : 1;
