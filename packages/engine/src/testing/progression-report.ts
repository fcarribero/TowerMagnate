import type { StarRating } from '@tower-magnate/shared';
import type { DaySample, ProgressionRun } from './progression-bot';

const RATINGS: readonly StarRating[] = [2, 3, 4, 5, 6];

function ratingName(stars: StarRating): string {
  return stars === 6 ? 'Torre' : `${stars} stars`;
}

function money(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('en-US')}`;
}

/** The game day a rating came, counting the first day as day 1; null if it never came. */
function dayOf(run: ProgressionRun, stars: StarRating): number | null {
  const reached = run.starDays.find((entry) => entry.stars === stars);
  return reached ? reached.day + 1 : null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

function summaryRow(runs: readonly ProgressionRun[], stars: StarRating): string {
  const days = runs.map((run) => dayOf(run, stars));
  const cells = days.map((day) => (day === null ? '-' : String(day)));
  const reached = days.filter((day): day is number => day !== null);
  const all = reached.length === runs.length;
  const middle = all ? String(median(reached)) : '-';
  const spread = all ? `${Math.min(...reached)} to ${Math.max(...reached)}` : '-';
  return `| ${ratingName(stars)} | ${cells.join(' | ')} | ${middle} | ${spread} |`;
}

function weekRow(sample: DaySample): string {
  return [
    '',
    String(sample.day + 1),
    String(sample.stars),
    sample.population.toLocaleString('en-US'),
    money(sample.money),
    `${sample.leasedOffices} of ${sample.offices}`,
    String(sample.venues),
    String(sample.cars),
    '',
  ].join(' | ');
}

/** Game days to each rating per seed, then a weekly trace of every seed. */
export function formatProgressionReport(runs: readonly ProgressionRun[], maxDays: number): string {
  const lines: string[] = [];
  const seeds = runs.map((run) => `Seed ${run.seed}`);
  lines.push(`Game day each rating came, by seed; "-" means not within ${maxDays} days.`, '');
  lines.push(`| Rating | ${seeds.join(' | ')} | Median | Spread |`);
  lines.push(`|---|${seeds.map(() => '---|').join('')}---|---|`);
  for (const stars of RATINGS) lines.push(summaryRow(runs, stars));
  for (const run of runs) {
    lines.push('', `### Seed ${run.seed}`, '');
    lines.push('| Day | Stars | Population | Money | Leased offices | Venues | Cars |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const sample of run.samples) {
      if (sample.day % 7 === 6 || sample === run.samples.at(-1)) {
        lines.push(weekRow(sample).trim());
      }
    }
    const failures = Object.entries(run.failedCommands).sort(([a], [b]) => a.localeCompare(b));
    if (failures.length > 0) {
      const text = failures.map(([key, count]) => `${key} ${count}`).join(', ');
      lines.push('', `Refused commands: ${text}.`);
    }
  }
  return `${lines.join('\n')}\n`;
}
