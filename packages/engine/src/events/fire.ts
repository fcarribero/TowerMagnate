import {
  FIRE_CLIMB_STEPS,
  FIRE_DAILY_ODDS,
  FIRE_LOWEST_LEVEL,
  FIRE_MAX_STEPS,
  FIRE_MIN_FLOOR_COLUMNS,
  FIRE_MIN_STARS,
  FIRE_ROLL_HOUR,
  levelAbove,
  TOP_FLOOR_LEVEL,
  UNIT_CATALOG,
  type BurningLevel,
  type Fire,
  type Level,
  type TowerState,
  type Unit,
} from '@tower-magnate/shared';
import { STEPS_PER_HOUR } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { structureAt } from '../grid';
import { nextInt } from '../rng';
import type { StepContext } from '../step';
import { unitNumber } from './bomb';
import { endDisaster, hasActiveDisaster, openFire } from './decisions';
import { burnCell, noDamage, type FireDamage } from './fire-cells';
import { burningLevels, runFireGuards, tickFireFronts } from './fire-guards';
import { structureOfLevel } from './guards';
import { emitNews } from '../news';

const ROLL_STEP_OF_DAY = FIRE_ROLL_HOUR * STEPS_PER_HOUR;

/**
 * Units a fire can start in, in increasing unit id: every unit but lobbies and the cathedral
 * whose bottom level is from 2 to 100 and has enough structure columns.
 */
export function fireCandidates(state: TowerState): Unit[] {
  const wideLevels = new Map<Level, boolean>();
  const isWide = (level: Level): boolean => {
    let wide = wideLevels.get(level);
    if (wide === undefined) {
      wide = structureOfLevel(state.grid, level).columns >= FIRE_MIN_FLOOR_COLUMNS;
      wideLevels.set(level, wide);
    }
    return wide;
  };
  return Object.values(state.units)
    .filter(
      (unit) =>
        unit.type !== 'lobby' &&
        unit.type !== 'cathedral' &&
        unit.level >= FIRE_LOWEST_LEVEL &&
        unit.level <= TOP_FLOOR_LEVEL &&
        isWide(unit.level),
    )
    .sort((a, b) => unitNumber(a) - unitNumber(b));
}

/** Lights a level of the fire at `column` (events 5.4) and burns that cell. */
export function igniteLevel(
  context: StepContext,
  fire: Fire,
  level: Level,
  column: number,
  damage: FireDamage,
): void {
  const front = { x: column, progress: 0, out: false };
  fire.levels[level] = {
    ignitionStep: context.state.step,
    ignitionColumn: column,
    left: { ...front },
    right: { ...front },
  };
  burnCell(context.state, level, column, damage);
}

function reportDamage(context: StepContext, damage: FireDamage): void {
  if (damage.cells.length === 0) return;
  if (damage.destroyedUnit) context.graph?.rebuild(context.state);
  context.events.push({
    type: 'disaster',
    step: context.state.step,
    kind: 'fire',
    cells: damage.cells,
  });
}

/**
 * Starts a fire without the daily roll: draws a candidate unit and a column of it, opens the
 * decision, emits the alert and lights the unit's bottom level at that column. Null while a
 * disaster is active or with no candidate.
 */
export function openRandomFire(context: StepContext): Fire | null {
  const { state } = context;
  if (hasActiveDisaster(state)) return null;
  const candidates = fireCandidates(state);
  if (candidates.length === 0) return null;
  const unit = candidates[nextInt(state.rng, 0, candidates.length - 1)] as Unit;
  const column = nextInt(state.rng, unit.x, unit.x + UNIT_CATALOG[unit.type].width - 1);
  const fire = openFire(context, unit.level) as Fire;
  context.events.push(
    ...emitNews(state, 'news.fire', { eventId: fire.id, params: { level: unit.level } }),
  );
  const damage = noDamage();
  igniteLevel(context, fire, unit.level, column, damage);
  reportDamage(context, damage);
  return fire;
}

/** The attempt's guests leave at 15:00 before this roll, so the recorded day is what counts. */
function weddingAttemptedToday(state: TowerState): boolean {
  return state.lastWeddingDay === Math.floor(state.step / STEPS_PER_DAY);
}

/** Events phase item 5: the 15:00 roll, made only when every condition holds. */
export function runFireRoll(context: StepContext): void {
  const { state } = context;
  if (state.step % STEPS_PER_DAY !== ROLL_STEP_OF_DAY) return;
  const canRoll =
    state.stars >= FIRE_MIN_STARS &&
    !hasActiveDisaster(state) &&
    !weddingAttemptedToday(state) &&
    fireCandidates(state).length > 0;
  if (!canRoll) return;
  if (nextInt(state.rng, 0, FIRE_DAILY_ODDS - 1) !== 0) return;
  openRandomFire(context);
}

/** The burned-span column nearest the ignition column with structure above, the lower on a tie. */
function climbColumn(state: TowerState, burning: BurningLevel, above: Level): number | null {
  const ignition = burning.ignitionColumn;
  const reach = Math.max(ignition - burning.left.x, burning.right.x - ignition);
  for (let distance = 0; distance <= reach; distance++) {
    for (const x of [ignition - distance, ignition + distance]) {
      const inSpan = x >= burning.left.x && x <= burning.right.x;
      if (inSpan && structureAt(state.grid, above, x) !== null) return x;
    }
  }
  return null;
}

/** Events 5.6: a level still burning 30 minutes after it ignited lights the level above. */
function climbFire(context: StepContext, fire: Fire, damage: FireDamage): void {
  const { state } = context;
  for (const level of burningLevels(fire)) {
    const burning = fire.levels[level] as BurningLevel;
    if (state.step !== burning.ignitionStep + FIRE_CLIMB_STEPS) continue;
    const above = levelAbove(level);
    if (above === null || above > TOP_FLOOR_LEVEL || fire.levels[above] !== undefined) continue;
    const column = climbColumn(state, burning, above);
    if (column !== null) igniteLevel(context, fire, above, column, damage);
  }
}

function putOut(fire: Fire): void {
  for (const burning of Object.values(fire.levels)) {
    if (!burning) continue;
    burning.left.out = true;
    burning.right.out = true;
  }
}

function finish(context: StepContext, fire: Fire, key: 'news.fireOut' | 'news.fireHelicopter') {
  putOut(fire);
  context.events.push(...emitNews(context.state, key, { eventId: fire.id }));
  endDisaster(context, fire.id);
}

function hasBurnedOut(fire: Fire): boolean {
  return Object.keys(fire.levels).length > 0 && burningLevels(fire).length === 0;
}

function ignitedAt(fire: Fire, step: number): boolean {
  return Object.values(fire.levels).some((burning) => burning?.ignitionStep === step);
}

/**
 * The fire's work of one step: the helicopter, the 19:00 burn-out, minute ticks and climbs, the
 * end once every level is out, and guard picks (events phase items 6, 7 and 9).
 */
export function runFire(context: StepContext, fire: Fire): void {
  const { step } = context.state;
  if (fire.decision.choice === 'helicopter') {
    finish(context, fire, 'news.fireHelicopter');
    return;
  }
  if (step >= fire.startStep + FIRE_MAX_STEPS) {
    finish(context, fire, 'news.fireOut');
    return;
  }
  const damage = noDamage();
  const levelWentOut = tickFireFronts(context, fire, damage);
  climbFire(context, fire, damage);
  reportDamage(context, damage);
  if (hasBurnedOut(fire)) {
    finish(context, fire, 'news.fireOut');
    return;
  }
  runFireGuards(context, fire, levelWentOut || ignitedAt(fire, step));
}
