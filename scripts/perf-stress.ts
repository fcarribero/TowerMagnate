/**
 * Render stress run: opens the stress page (apps/web/perf.html) in Chromium,
 * lets it warm up and run, then prints the page's frame report and the heap
 * growth between two forced garbage collections.
 * Start the web dev server first (`pnpm dev`), then run
 * `pnpm perf:stress -- --minutes 30 --url http://localhost:5173/perf.html --headed`.
 * Exits with 1 when draw calls reach 200 or the heap grew 5% or more. Frame rate
 * depends on the machine and is printed, not checked; headless Chromium draws in software.
 * `--uncapped` turns off vsync and the frame rate limit, so the frame time is the cost of a
 * frame instead of the display interval.
 * The settled heap is printed every minute. `--snapshots 5,30` also writes heap snapshots at
 * those minutes to `--snapshot-dir` and prints which kinds of objects grew between the first and last.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import {
  compareHeapSummaries,
  formatHeapGrowth,
  summarizeHeapSnapshot,
  type HeapSnapshot,
  type HeapSummary,
} from './heap-snapshot-summary';

const MAX_DRAW_CALLS = 200;
const MAX_HEAP_GROWTH = 0.05;
const WARM_UP_MS = 15_000;

interface FrameReport {
  frames: number;
  fps: number;
  p95FrameMs: number;
  maxDrawCalls: number;
  meanDrawCalls: number;
  heapStartBytes: number | null;
  heapNowBytes: number | null;
  heapGrowth: number | null;
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const minutes = Number(option('minutes', '1'));
const url = option('url', 'http://localhost:5173/perf.html');
const headed = process.argv.includes('--headed');
const uncapped = process.argv.includes('--uncapped');
const uncappedArgs = ['--disable-gpu-vsync', '--disable-frame-rate-limit'];
const snapshotMinutes = option('snapshots', '')
  .split(',')
  .filter((minute) => minute !== '')
  .map(Number);
const snapshotDir = option('snapshot-dir', 'heap-snapshots');
const HEAP_GROWTH_ROWS = 25;

function megabytes(bytes: number): string {
  return (bytes / 1_048_576).toFixed(2);
}

const browser = await chromium.launch({
  headless: !headed,
  args: [
    '--enable-precise-memory-info',
    '--disable-renderer-backgrounding',
    ...(uncapped ? uncappedArgs : []),
  ],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (error) => console.error('Page error:', error.message));
const devtools = await page.context().newCDPSession(page);
/** Heap after a full collection, so the sawtooth of short-lived frame objects is left out. */
async function settledHeapBytes(): Promise<number> {
  await devtools.send('HeapProfiler.collectGarbage');
  const { usedSize } = await devtools.send('Runtime.getHeapUsage');
  return usedSize;
}

/** Writes a heap snapshot to the snapshot folder and returns its sum by object kind. */
async function heapSnapshot(minute: number): Promise<HeapSummary> {
  const chunks: string[] = [];
  const collect = ({ chunk }: { chunk: string }) => chunks.push(chunk);
  devtools.on('HeapProfiler.addHeapSnapshotChunk', collect);
  await devtools.send('HeapProfiler.collectGarbage');
  await devtools.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  devtools.off('HeapProfiler.addHeapSnapshotChunk', collect);
  const text = chunks.join('');
  await mkdir(snapshotDir, { recursive: true });
  await writeFile(join(snapshotDir, `minute-${minute}.heapsnapshot`), text);
  return summarizeHeapSnapshot(JSON.parse(text) as HeapSnapshot);
}

await page.goto(url);
await page.waitForFunction(() => 'perfReport' in globalThis);
await page.waitForTimeout(WARM_UP_MS);
const heapStart = await settledHeapBytes();
console.log(`Running ${url} for ${minutes} min...`);
const heapByMinute: string[] = [];
const summaries: { minute: number; summary: HeapSummary }[] = [];
for (let minute = 1; minute <= Math.ceil(minutes); minute++) {
  await page.waitForTimeout(Math.min(1, minutes - minute + 1) * 60_000);
  if (snapshotMinutes.includes(minute)) {
    summaries.push({ minute, summary: await heapSnapshot(minute) });
  }
  heapByMinute.push(megabytes(await settledHeapBytes()));
}
const heapEnd = await settledHeapBytes();
const report = await page.evaluate(() =>
  (globalThis as unknown as { perfReport: () => FrameReport }).perfReport(),
);
await browser.close();

const growth = (heapEnd - heapStart) / heapStart;
console.log(JSON.stringify(report, null, 2));
console.log(`Heap after collection by minute (MB): ${heapByMinute.join(' ')}`);
const first = summaries[0];
const last = summaries.at(-1);
if (first !== undefined && last !== undefined && first !== last) {
  console.log(`Heap snapshot diff, minute ${first.minute} to minute ${last.minute}:`);
  console.log(
    formatHeapGrowth(compareHeapSummaries(first.summary, last.summary), HEAP_GROWTH_ROWS),
  );
}
console.log(
  `Heap after collection: ${megabytes(heapStart)} MB -> ${megabytes(heapEnd)} MB (${(growth * 100).toFixed(1)}%)`,
);
const failures = [
  report.maxDrawCalls >= MAX_DRAW_CALLS && `draw calls reached ${report.maxDrawCalls}`,
  growth >= MAX_HEAP_GROWTH && `heap grew ${(growth * 100).toFixed(1)}%`,
].filter(Boolean);
for (const failure of failures) console.error(`Over budget: ${failure}`);
process.exitCode = failures.length > 0 ? 1 : 0;
