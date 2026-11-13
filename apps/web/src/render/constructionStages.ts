export interface BuildStage {
  /** 0 is the bare site; later indexes are the scaffolded unit, each showing more of it. */
  index: number;
  /** Share of the unit's height already built, from the bottom, from 0 to 1. */
  built: number;
}

/** Below this percent the site is only a marked zone with a fence and a crane. */
const BARE_SITE_PERCENT = 8;
/** The unit is revealed in steps of this many percent, so it is redrawn rarely. */
const STAGE_PERCENT = 4;

/**
 * What a construction site looks like at `percent` built (0 to 100): a marked zone first, then
 * the empty unit rising behind scaffolding. At 100 the site is a unit and has no stage.
 */
export function buildStageFor(percent: number): BuildStage | null {
  if (percent >= 100) {
    return null;
  }
  if (percent < BARE_SITE_PERCENT) {
    return { index: 0, built: 0 };
  }
  const step = Math.floor(percent / STAGE_PERCENT);
  return { index: step, built: Math.min((step * STAGE_PERCENT) / 100, 0.96) };
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
