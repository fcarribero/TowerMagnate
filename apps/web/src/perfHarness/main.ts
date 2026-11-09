import { levelToIndex, type UnitView } from '@tower-magnate/shared';
import { DELTA_INTERVAL_MS, progressSince } from '../model/interpolation';
import { WORLD_WIDTH, levelTop } from '../render/levels';
import { mountStage } from '../render/stage';
import { fullWidthTestTower } from '../render/structureSource';
import { FLOOR_HEIGHT, TOWER_WIDTH_TILES } from '../render/metrics';
import { ALL_VENUES_OPEN } from '../render/venueHours';
import { countDrawCalls } from './drawCallCounter';
import { FrameMeter, type FrameReport } from './frameMeter';
import { StressCrowd } from './stressCrowd';

/**
 * Render stress page: a full tower with a made-up crowd fed straight into the
 * stage, with no server. Open /perf.html on the dev server. Query parameters:
 * people (3000), floors (100), shafts (8), zoom (1), pan (0 or 1), warmup in seconds (10).
 */

const OFFICE_WIDTH_TILES = 9;
const FIRST_OFFICE_LEVEL = 4;
const REPORT_INTERVAL_MS = 1000;
/** One sweep up and down the tower takes about a minute. */
const PAN_PERIOD_MS = 60_000;

interface PerfWindow extends Window {
  perfReport?: () => FrameReport;
}

interface ChromeMemory {
  memory?: { usedJSHeapSize: number };
}

const params = new URLSearchParams(location.search);
const numberParam = (name: string, fallback: number): number => {
  const value = Number(params.get(name));
  return params.has(name) && Number.isFinite(value) ? value : fallback;
};

const settings = {
  people: numberParam('people', 3000),
  floors: Math.min(Math.max(numberParam('floors', 100), FIRST_OFFICE_LEVEL), 100),
  shafts: numberParam('shafts', 8),
  zoom: numberParam('zoom', 1),
  pan: params.get('pan') === '1',
  warmUpMs: numberParam('warmup', 10) * 1000,
};

function offices(floors: number): UnitView[] {
  const units: UnitView[] = [];
  for (let level = FIRST_OFFICE_LEVEL; level <= floors; level++) {
    for (let x = 0; x + OFFICE_WIDTH_TILES <= TOWER_WIDTH_TILES; x += OFFICE_WIDTH_TILES) {
      units.push({
        id: `office-${level}-${x}`,
        type: 'office',
        x,
        level,
        name: null,
        price: 'normal',
        occupied: true,
        variant: 'occupied',
      });
    }
  }
  return units;
}

function heapBytes(): number | null {
  return (performance as ChromeMemory).memory?.usedJSHeapSize ?? null;
}

function describe(report: FrameReport): string {
  const megabytes = (bytes: number | null) =>
    bytes === null ? 'n/a' : `${(bytes / 1_048_576).toFixed(1)} MB`;
  const growth = report.heapGrowth === null ? 'n/a' : `${(report.heapGrowth * 100).toFixed(1)} %`;
  return [
    `people ${settings.people}  floors ${settings.floors}  zoom ${settings.zoom}  pan ${settings.pan}`,
    `fps ${report.fps.toFixed(1)}  p95 frame ${report.p95FrameMs.toFixed(1)} ms`,
    `draw calls mean ${report.meanDrawCalls.toFixed(0)}  max ${report.maxDrawCalls}`,
    `heap ${megabytes(report.heapStartBytes)} -> ${megabytes(report.heapNowBytes)} (${growth})`,
    `frames measured ${report.frames}`,
  ].join('\n');
}

async function start(): Promise<void> {
  const host = document.getElementById('stage');
  const output = document.getElementById('report');
  if (host === null || output === null) {
    throw new Error('Missing #stage or #report element');
  }
  const stage = await mountStage(host);
  const canvas = host.querySelector('canvas');
  if (canvas === null) {
    throw new Error('The stage made no canvas');
  }
  const readDrawCalls = countDrawCalls(canvas);

  stage.showStructure(fullWidthTestTower(settings.floors));
  stage.showUnits({
    units: offices(settings.floors),
    transports: [],
    time: 'day',
    openVenues: ALL_VENUES_OPEN,
  });
  const crowd = new StressCrowd({
    people: settings.people,
    floors: settings.floors,
    shafts: settings.shafts,
    riders: 0.05,
    churn: 0.01,
  });
  stage.showShafts(crowd.shafts);

  let stepArrivedAt = performance.now();
  window.setInterval(() => {
    crowd.step();
    stepArrivedAt = performance.now();
  }, DELTA_INTERVAL_MS);
  const shaftsById = new Map(crowd.shafts.map((shaft) => [shaft.id, shaft]));
  stage.feedCars(() => ({
    frame: crowd.frame(progressSince(stepArrivedAt, performance.now())),
    shafts: shaftsById,
  }));

  while (stage.camera().zoom > settings.zoom) stage.zoomStep(-1);
  while (stage.camera().zoom < settings.zoom) stage.zoomStep(1);
  const middle = levelToIndex(Math.ceil(settings.floors / 2));
  stage.centerOn(WORLD_WIDTH / 2, levelTop(middle));

  const meter = new FrameMeter();
  const startedAt = performance.now();
  let previousFrameAt = startedAt;
  const onFrame = (now: number): void => {
    const frameMs = now - previousFrameAt;
    previousFrameAt = now;
    const drawCalls = readDrawCalls();
    if (now - startedAt >= settings.warmUpMs) {
      meter.add({ frameMs, drawCalls, heapBytes: heapBytes() });
    }
    if (settings.pan) {
      const phase = ((now - startedAt) / PAN_PERIOD_MS) * 2 * Math.PI;
      const swing = Math.sin(phase) * (settings.floors / 2) * FLOOR_HEIGHT;
      stage.centerOn(WORLD_WIDTH / 2, levelTop(middle) + swing);
    }
    requestAnimationFrame(onFrame);
  };
  requestAnimationFrame(onFrame);

  (window as PerfWindow).perfReport = () => meter.report();
  window.setInterval(() => {
    output.textContent = describe(meter.report());
  }, REPORT_INTERVAL_MS);
}

void start();
