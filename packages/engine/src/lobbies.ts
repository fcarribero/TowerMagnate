import {
  LOBBY_LIGHTING_DIRT_CUT,
  LOBBY_MUSIC_NOISE_CUT,
  LOBBY_PLANTS_STRESS_CUT,
  LAST_COLUMN,
  upgradesOf,
  type GridState,
  type Level,
  type LobbyHeight,
  type LobbyUpgrades,
  type TowerState,
} from '@tower-magnate/shared';
import { lobbyRows } from './commands/build-lobby';
import { calmAt } from './comfort-units';
import { heatOf, stressPerMinute, valueAt } from './heat';
import { lobbyBases } from './trip-ledger';

/**
 * A lobby: one run of lobby cells on the base level of the main lobby or of a sky lobby, with the
 * rows above it that a tall lobby takes. Its id is its base level and first column (service-units 2.4).
 */
export interface Lobby {
  id: string;
  level: Level;
  height: LobbyHeight;
  x0: number;
  x1: number;
}

export function lobbyId(level: number, x0: number): string {
  return `l${level}x${x0}`;
}

/** Every lobby of the tower, by base level and then by column. */
export function lobbiesOf(grid: GridState): Lobby[] {
  const lobbies: Lobby[] = [];
  for (const [level, height] of lobbyBases(grid)) {
    for (const span of grid.levels[level]?.structure ?? []) {
      if (span.kind !== 'lobby') continue;
      lobbies.push({ id: lobbyId(level, span.x0), level, height, x0: span.x0, x1: span.x1 });
    }
  }
  return lobbies;
}

export function findLobby(grid: GridState, id: string): Lobby | undefined {
  return lobbiesOf(grid).find((lobby) => lobby.id === id);
}

/** The cells a lobby takes: its columns on every one of its rows. */
export function lobbyCells(lobby: Lobby): number {
  return (lobby.x1 - lobby.x0 + 1) * lobbyRows(lobby.level, lobby.height).length;
}

function overlaps(entry: LobbyUpgrades, lobby: Lobby): boolean {
  return entry.level === lobby.level && entry.x0 <= lobby.x1 && lobby.x0 <= entry.x1;
}

/**
 * The upgrade levels of a lobby. Stored entries are matched by the columns they had when written,
 * so a lobby that joined two upgraded lobbies has the higher level of each upgrade, and both parts
 * of a lobby that was cut in two keep the levels it had.
 */
export function lobbyUpgrades(state: TowerState, lobby: Lobby): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const entry of Object.values(state.lobbies ?? {})) {
    if (!overlaps(entry, lobby)) continue;
    for (const [id, level] of Object.entries(entry.upgrades)) {
      levels[id] = Math.max(levels[id] ?? 0, level);
    }
  }
  return levels;
}

/**
 * Sets one upgrade level on a lobby. All the entries of the lobby's base level are written again
 * for the lobbies there now, so no other lobby on that level loses or gains a level; entries for
 * columns that are no longer lobby are dropped.
 */
export function setLobbyUpgrade(state: TowerState, lobby: Lobby, upgradeId: string, level: number) {
  const next: Record<string, LobbyUpgrades> = {};
  for (const [id, entry] of Object.entries(state.lobbies ?? {})) {
    if (entry.level !== lobby.level) next[id] = entry;
  }
  for (const other of lobbiesOf(state.grid)) {
    if (other.level !== lobby.level) continue;
    const upgrades = lobbyUpgrades(state, other);
    if (other.id === lobby.id) upgrades[upgradeId] = level;
    if (Object.keys(upgrades).length === 0) continue;
    next[other.id] = { level: other.level, x0: other.x0, x1: other.x1, upgrades };
  }
  state.lobbies = next;
}

/** How much of the noise, the dirt and the stress a person feels in one lobby cell. */
export interface LobbyComfort {
  noise: number;
  dirt: number;
  stress: number;
}

/** Comfort per cell, by level: 0 is a cell outside any upgraded lobby, n is `table[n - 1]`. */
interface ComfortMap {
  cells: Map<number, Uint8Array>;
  table: LobbyComfort[];
}

const comfortMemo = new WeakMap<object, { grid: GridState; map: ComfortMap }>();
const NO_COMFORT: ComfortMap = { cells: new Map(), table: [] };

function comfortOf(upgrades: Record<string, number>): LobbyComfort {
  const level = (id: string): number => upgrades[id] ?? 0;
  return {
    noise: Math.max(0, 1 - LOBBY_MUSIC_NOISE_CUT * level('music')),
    dirt: Math.max(0, 1 - LOBBY_LIGHTING_DIRT_CUT * level('lighting')),
    stress: Math.max(0, 1 - LOBBY_PLANTS_STRESS_CUT * level('plants')),
  };
}

function buildComfort(state: TowerState): ComfortMap {
  const map: ComfortMap = { cells: new Map(), table: [] };
  const known = new Set(upgradesOf('lobby').map((definition) => definition.id));
  for (const lobby of lobbiesOf(state.grid)) {
    const upgrades = lobbyUpgrades(state, lobby);
    if (!Object.entries(upgrades).some(([id, level]) => known.has(id) && level > 0)) continue;
    map.table.push(comfortOf(upgrades));
    const index = map.table.length;
    for (const row of lobbyRows(lobby.level, lobby.height)) {
      let cells = map.cells.get(row);
      if (!cells) {
        cells = new Uint8Array(LAST_COLUMN + 1);
        map.cells.set(row, cells);
      }
      cells.fill(index, Math.max(0, lobby.x0), lobby.x1 + 1);
    }
  }
  return map;
}

/**
 * The comfort lookup of a tower. Built once for each lobbies record and grid; a tower with no
 * lobby upgrades gets an empty map at once.
 */
function comfortMap(state: TowerState): ComfortMap {
  const lobbies = state.lobbies;
  if (!lobbies) return NO_COMFORT;
  const kept = comfortMemo.get(lobbies);
  if (kept && kept.grid === state.grid) return kept.map;
  const map = buildComfort(state);
  comfortMemo.set(lobbies, { grid: state.grid, map });
  return map;
}

/** The comfort of a lobby cell with upgrades, or null for every other cell. */
export function lobbyComfortAt(
  state: TowerState,
  level: number,
  column: number,
): LobbyComfort | null {
  const map = comfortMap(state);
  if (map.table.length === 0) return null;
  const index = map.cells.get(level)?.[column] ?? 0;
  return index === 0 ? null : (map.table[index - 1] ?? null);
}

/**
 * The stress a minute in this cell gives: its noise and dirt, less what the music, the lighting and
 * the plants of an upgraded lobby take off, and less again near a garden, a lounge or a library.
 */
export function cellStressPerMinute(state: TowerState, level: number, column: number): number {
  const parts = cellStressParts(state, level, column);
  return parts.noise + parts.dirt;
}

/** What the person feels of a cell: its noise, its dirt, or both. */
export interface Felt {
  noise: boolean;
  dirt: boolean;
}

const FEEL_ALL: Felt = { noise: true, dirt: true };

/** The stress a minute in this cell gives, split into its noise part and its dirt part. */
export function cellStressParts(
  state: TowerState,
  level: number,
  column: number,
  felt: Felt = FEEL_ALL,
): { noise: number; dirt: number } {
  const heat = heatOf(state);
  let noise = felt.noise ? valueAt(heat.noise, level, column) : 0;
  let dirt = felt.dirt ? valueAt(heat.dirt, level, column) : 0;
  let scale = calmAt(state, level, column);
  const comfort = lobbyComfortAt(state, level, column);
  if (comfort) {
    noise *= comfort.noise;
    dirt *= comfort.dirt;
    scale *= comfort.stress;
  }
  return { noise: stressPerMinute(noise, 0) * scale, dirt: stressPerMinute(0, dirt) * scale };
}
