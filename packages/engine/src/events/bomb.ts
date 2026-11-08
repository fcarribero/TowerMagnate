import {
  BOMB_BLAST_COLUMNS_LEFT,
  BOMB_BLAST_COLUMNS_RIGHT,
  BOMB_BLAST_LEVELS_ABOVE,
  BOMB_BLAST_LEVELS_BELOW,
  BOMB_DAILY_ODDS,
  BOMB_EXPLODE_HOUR,
  BOMB_MIN_STARS,
  BOMB_ROLL_HOUR,
  bombRansom,
  FIRST_COLUMN,
  LAST_COLUMN,
  levelAbove,
  levelBelow,
  LOWEST_BUILDABLE_LEVEL,
  TOP_FLOOR_LEVEL,
  TOWER_LAYOUT,
  UNIT_CATALOG,
  type BombCell,
  type BombThreat,
  type CellRange,
  type Level,
  type TowerState,
  type Unit,
  type UnitId,
} from '@tower-magnate/shared';
import { STEPS_PER_HOUR } from '../calendar';
import { STEPS_PER_DAY } from '../clock';
import { unitLevels } from '../commands/demolish';
import { columnRuns, columnsBetween } from '../commands/structure';
import {
  addOccupant,
  occupantAt,
  overlappingOccupants,
  removeOccupant,
  setStructure,
  structureAt,
} from '../grid';
import { parseUnitNumber, removePeopleOfUnit } from '../people';
import { nextInt } from '../rng';
import type { StepContext } from '../step';
import { startBombSearch } from './bomb-search';
import { endDisaster, hasActiveDisaster, openBombThreat } from './decisions';

const ROLL_STEP_OF_DAY = BOMB_ROLL_HOUR * STEPS_PER_HOUR;
const EXPLODE_STEP_OF_DAY = BOMB_EXPLODE_HOUR * STEPS_PER_HOUR;

function unitNumber(unit: Unit): number {
  return parseUnitNumber(unit.id) ?? 0;
}

/** Units a bomb can be hidden in, in increasing unit id: every unit but lobbies and the cathedral. */
export function bombCandidates(state: TowerState): Unit[] {
  return Object.values(state.units)
    .filter((unit) => unit.type !== 'lobby' && unit.type !== 'cathedral')
    .sort((a, b) => unitNumber(a) - unitNumber(b));
}

function drawBombCell(state: TowerState, candidates: readonly Unit[]): BombCell {
  const unit = candidates[nextInt(state.rng, 0, candidates.length - 1)] as Unit;
  const x = nextInt(state.rng, unit.x, unit.x + UNIT_CATALOG[unit.type].width - 1);
  return { x, level: unit.level };
}

/**
 * Opens a bomb threat without the daily roll: draws the unit and the column, fixes the ransom
 * for the current rating and emits the alert. Null while a disaster is active or with no unit
 * to hide the bomb in.
 */
export function openRandomBombThreat(context: StepContext): BombThreat | null {
  const { state } = context;
  if (hasActiveDisaster(state)) return null;
  const candidates = bombCandidates(state);
  if (candidates.length === 0) return null;
  const threat = openBombThreat(context, bombRansom(state.stars), drawBombCell(state, candidates));
  context.events.push({ type: 'news', step: state.step, key: 'news.bombThreat', unitId: null });
  return threat;
}

/** Opens the 09:00 bomb threat, or not. Scenarios swap the daily roll for their own. */
export type BombRoll = (context: StepContext) => void;

/** Whether a threat could open now: 2 stars or more, no disaster active and a unit to hide it in. */
export function canOpenBombThreat(state: TowerState): boolean {
  return (
    state.stars >= BOMB_MIN_STARS && !hasActiveDisaster(state) && bombCandidates(state).length > 0
  );
}

/** Events phase item 3: the 09:00 roll, made only when every condition holds. */
export const rollBombThreat: BombRoll = (context) => {
  const { state } = context;
  if (!canOpenBombThreat(state)) return;
  if (nextInt(state.rng, 0, BOMB_DAILY_ODDS - 1) !== 0) return;
  openRandomBombThreat(context);
};

/** Ends a threat whose ransom was just paid. Guards have not left their offices yet. */
export function endPaidBombThreat(state: TowerState, eventId: string): void {
  state.activeEvents = state.activeEvents.filter((event) => event.id !== eventId);
}

/** The search starts once the decision closed with `refuse`, by answer or at the deadline. */
function startSearchAfterRefusal(context: StepContext, threat: BombThreat): void {
  if (threat.search !== null || threat.decision.choice !== 'refuse') return;
  context.events.push({
    type: 'news',
    step: context.state.step,
    key: 'news.bombSearch',
    unitId: null,
  });
  startBombSearch(context, threat, threat.bomb.level);
}

function stepsAway(from: Level, count: number, next: (level: Level) => Level | null): Level[] {
  const levels: Level[] = [];
  let level: Level | null = from;
  for (let step = 0; step < count; step++) {
    level = level === null ? null : next(level);
    if (level !== null) levels.push(level);
  }
  return levels;
}

/** Levels of the blast box in level order, cut to the site; level 1 is never in it. */
export function blastLevels(bombLevel: Level): Level[] {
  const below = stepsAway(bombLevel, BOMB_BLAST_LEVELS_BELOW, levelBelow).reverse();
  const above = stepsAway(bombLevel, BOMB_BLAST_LEVELS_ABOVE, levelAbove);
  return [...below, bombLevel, ...above].filter(
    (level) =>
      level >= LOWEST_BUILDABLE_LEVEL &&
      level <= TOP_FLOOR_LEVEL &&
      level !== TOWER_LAYOUT.mainLobbyFloor,
  );
}

export function blastColumns(bombX: number): { x0: number; x1: number } {
  return {
    x0: Math.max(FIRST_COLUMN, bombX - BOMB_BLAST_COLUMNS_LEFT),
    x1: Math.min(LAST_COLUMN, bombX + BOMB_BLAST_COLUMNS_RIGHT),
  };
}

function unitsInBox(state: TowerState, levels: readonly Level[], x0: number, x1: number): Unit[] {
  const ids = new Set<UnitId>();
  for (const level of levels) {
    for (const span of overlappingOccupants(state.grid, level, x0, x1)) {
      if (span.occupant.kind === 'unit') ids.add(span.occupant.id);
    }
  }
  return [...ids]
    .map((id) => state.units[id])
    .filter((unit): unit is Unit => unit !== undefined && unit.type !== 'cathedral')
    .sort((a, b) => unitNumber(a) - unitNumber(b));
}

/** Like a demolition, with no refund and no condo buyback; every cell of the unit turns to ruins. */
function destroyUnit(state: TowerState, unit: Unit): CellRange[] {
  const x1 = unit.x + UNIT_CATALOG[unit.type].width - 1;
  const ruined: CellRange[] = [];
  removePeopleOfUnit(state, unit.id);
  for (const level of unitLevels(unit)) {
    removeOccupant(state.grid, level, { kind: 'unit', id: unit.id });
    setStructure(state.grid, level, unit.x, x1, 'floor');
    addOccupant(state.grid, level, unit.x, x1, { kind: 'ruins' });
    ruined.push({ level, x0: unit.x, x1 });
  }
  Reflect.deleteProperty(state.units, unit.id);
  return ruined;
}

/** Cells of the box with structure and nothing on them turn to ruins. */
function ruinEmptyCells(state: TowerState, level: Level, x0: number, x1: number): CellRange[] {
  const empty = columnsBetween(x0, x1).filter(
    (x) => structureAt(state.grid, level, x) !== null && occupantAt(state.grid, level, x) === null,
  );
  return columnRuns(empty).map((run) => {
    addOccupant(state.grid, level, run.x0, run.x1, { kind: 'ruins' });
    return { level, x0: run.x0, x1: run.x1 };
  });
}

/** Ruins the blast box around the bomb and returns every cell that became ruins. */
export function ruinBlastBox(state: TowerState, bomb: BombCell): CellRange[] {
  const levels = blastLevels(bomb.level);
  const { x0, x1 } = blastColumns(bomb.x);
  const ruined: CellRange[] = [];
  for (const unit of unitsInBox(state, levels, x0, x1)) ruined.push(...destroyUnit(state, unit));
  for (const level of levels) ruined.push(...ruinEmptyCells(state, level, x0, x1));
  return ruined;
}

/** Events phase item 4: an unfound bomb explodes at 13:00 and the threat ends. */
function explode(context: StepContext, threat: BombThreat): void {
  const { state } = context;
  const cells = ruinBlastBox(state, threat.bomb);
  context.graph?.rebuild(state);
  context.events.push({ type: 'disaster', step: state.step, kind: 'bomb', cells });
  context.events.push({
    type: 'news',
    step: state.step,
    key: 'news.bombExploded',
    level: threat.bomb.level,
  });
  endDisaster(context, threat.id);
}

function activeBombThreat(state: TowerState): BombThreat | undefined {
  return state.activeEvents.find((event): event is BombThreat => event.kind === 'bomb');
}

/** Bomb work of the events phase that is not the search itself: refusal, roll and explosion. */
export function runBombSchedule(context: StepContext, roll: BombRoll = rollBombThreat): void {
  const threat = activeBombThreat(context.state);
  if (threat) startSearchAfterRefusal(context, threat);
  const stepOfDay = context.state.step % STEPS_PER_DAY;
  if (stepOfDay === ROLL_STEP_OF_DAY) roll(context);
  const current = activeBombThreat(context.state);
  if (stepOfDay === EXPLODE_STEP_OF_DAY && current) explode(context, current);
}
