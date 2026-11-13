/** How long a unit takes to go from an empty building site to the finished unit. */
export const UNIT_BUILD_MS = 2400;

export interface BuildStage {
  /** 0 is the bare site; the last stage is the unit almost done. */
  index: number;
  /** Share of the unit's height already built, from the bottom, from 0 to 1. */
  built: number;
}

/** Each stage shows more of the unit than the one before, from the empty site to nearly whole. */
export const BUILD_STAGES: readonly (BuildStage & { until: number })[] = [
  { index: 0, built: 0, until: 0.2 },
  { index: 1, built: 0.3, until: 0.45 },
  { index: 2, built: 0.6, until: 0.7 },
  { index: 3, built: 0.85, until: 1 },
];

/** The stage at `elapsedMs` since the unit was placed; null once the unit is finished. */
export function buildStageAt(elapsedMs: number): BuildStage | null {
  const progress = elapsedMs / UNIT_BUILD_MS;
  if (progress >= 1) {
    return null;
  }
  const stage = BUILD_STAGES.find((candidate) => progress < candidate.until) ?? BUILD_STAGES[0];
  return stage === undefined ? null : { index: stage.index, built: stage.built };
}

export interface SiteRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

const GROUND = 0x6b5a45;
const POLE = 0x9a9a9a;
const PLANK = 0xc9a063;
const TAPE_YELLOW = 0xffd400;
const TAPE_BLACK = 0x111111;
const CRANE = 0xe8892b;
const POLE_GAP = 24;
const PLANK_GAP = 10;
const TAPE_BLOCK = 4;

/**
 * The rectangles of the building site over a unit box: a dirt strip, then a fence with hazard
 * tape and a small crane while the site is bare, and scaffolding up to the built height after.
 */
export function siteRects(
  stage: BuildStage,
  box: { x: number; y: number; width: number; height: number },
): SiteRect[] {
  const { x, y, width, height } = box;
  const bottom = y + height;
  const rects: SiteRect[] = [{ x, y: bottom - 3, w: width, h: 3, color: GROUND }];
  if (stage.index === 0) {
    const tapeY = bottom - Math.max(Math.round(height * 0.3), 6);
    for (let at = 0; at < width; at += TAPE_BLOCK) {
      rects.push({
        x: x + at,
        y: tapeY,
        w: Math.min(TAPE_BLOCK, width - at),
        h: 3,
        color: (at / TAPE_BLOCK) % 2 === 0 ? TAPE_YELLOW : TAPE_BLACK,
      });
    }
    for (let at = 0; at < width; at += 16) {
      rects.push({ x: x + at, y: tapeY, w: 2, h: bottom - 3 - tapeY, color: CRANE });
    }
    const craneX = x + Math.round(width * 0.25);
    const craneTop = y + Math.round(height * 0.15);
    rects.push({ x: craneX, y: craneTop, w: 2, h: bottom - 3 - craneTop, color: CRANE });
    rects.push({ x: craneX, y: craneTop, w: Math.round(width * 0.4), h: 2, color: CRANE });
    return rects;
  }
  const builtTop = bottom - Math.round(height * stage.built);
  const scaffoldTop = Math.max(y, builtTop - 6);
  const poleXs = new Set<number>([x, x + width - 2]);
  for (let at = POLE_GAP; at < width - 2; at += POLE_GAP) {
    poleXs.add(x + at);
  }
  for (const poleX of poleXs) {
    rects.push({ x: poleX, y: scaffoldTop, w: 2, h: bottom - 3 - scaffoldTop, color: POLE });
  }
  for (let at = bottom - 3 - PLANK_GAP; at >= scaffoldTop; at -= PLANK_GAP) {
    rects.push({ x, y: at, w: width, h: 2, color: PLANK });
  }
  return rects;
}
