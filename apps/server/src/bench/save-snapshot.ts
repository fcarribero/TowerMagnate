import { performance } from 'node:perf_hooks';
import { serializeState } from '@tower-magnate/engine';
import pg from 'pg';
import { createSnapshotRepository } from '../snapshots';
import { startTestDatabase } from '../testing/database';
import { createTowerRow } from '../testing/tower-rows';
import { ONE_MEGABYTE, towerOfAtLeast } from '../testing/towers';

const SAVE_BUDGET_MS = 50;
const WARMUP_SAVES = 5;
const MEASURED_SAVES = 30;

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[index] ?? 0;
}

async function measureSaves(): Promise<number[]> {
  const database = await startTestDatabase({ migrate: true });
  const pool = new pg.Pool({ connectionString: database.url });
  try {
    const repository = createSnapshotRepository(pool);
    const towerId = await createTowerRow(pool);
    const bigTower = towerOfAtLeast(ONE_MEGABYTE);
    const bytes = serializeState(bigTower).length;
    console.log(`State size: ${(bytes / ONE_MEGABYTE).toFixed(2)} MB`);

    let step = 0;
    for (let warmup = 0; warmup < WARMUP_SAVES; warmup++) {
      step += 1;
      await repository.save(towerId, { ...bigTower, step });
    }

    const timings: number[] = [];
    for (let run = 0; run < MEASURED_SAVES; run++) {
      step += 1;
      const started = performance.now();
      await repository.save(towerId, { ...bigTower, step });
      timings.push(performance.now() - started);
    }
    return timings;
  } finally {
    await pool.end();
    await database.stop();
  }
}

async function main(): Promise<void> {
  const timings = await measureSaves();
  const medianMs = percentile(timings, 0.5);
  console.log(
    `Saves: ${timings.length}, median ${medianMs.toFixed(1)} ms, ` +
      `p90 ${percentile(timings, 0.9).toFixed(1)} ms, max ${Math.max(...timings).toFixed(1)} ms`,
  );
  if (medianMs >= SAVE_BUDGET_MS) {
    console.error(`Median save time is over the ${SAVE_BUDGET_MS} ms budget.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Median save time is within the ${SAVE_BUDGET_MS} ms budget.`);
}

await main();
