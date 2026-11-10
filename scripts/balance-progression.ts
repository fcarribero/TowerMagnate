/**
 * Balance pass: plays the progression bot from an empty tower on several seeds and prints the game
 * day of each rating as a Markdown report. Run with
 * `pnpm balance:progression [--seeds 1,2,3,4,5] [--days 200] [--out report.md]`.
 * The report has no timings, so the same seeds always give the same bytes.
 */
import { writeFileSync } from 'node:fs';
import { formatProgressionReport, runProgression } from '@tower-magnate/engine/testing';
import type { ProgressionRun } from '@tower-magnate/engine/testing';

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const seeds = option('seeds', '1,2,3,4,5').split(',').map(Number);
const maxDays = Number(option('days', '200'));
const out = option('out', '');

const runs: ProgressionRun[] = [];
for (const seed of seeds) {
  const started = Date.now();
  const run = runProgression({
    seed,
    maxDays,
    onDay: (day, state) => {
      if (day % 7 === 6) {
        const seconds = Math.round((Date.now() - started) / 1000);
        process.stderr.write(`seed ${seed} day ${day + 1}: ${state.stars} stars, ${seconds}s\n`);
      }
    },
  });
  runs.push(run);
}

const report = formatProgressionReport(runs, maxDays);
if (out) writeFileSync(out, report);
else process.stdout.write(report);
