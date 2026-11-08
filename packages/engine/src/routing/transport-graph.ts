import {
  isBasement,
  levelAbove,
  SHAFT_UNIT_TYPES,
  TOWER_LAYOUT,
  UNIT_CATALOG,
  type ColumnSpan,
  type EntityId,
  type Level,
  type Shaft,
  type ShaftId,
  type TowerState,
} from '@tower-magnate/shared';
import { isExpressStop, isInsideShaft, shaftLevels } from '../commands/shafts';
import { walkableLevelOfUnit, walkableRuns } from './walkable-runs';

/** Routing section 3: a stair or escalator flight has its point on both levels at x + 4. */
const FLIGHT_POINT_OFFSET = 4;

export type NodeId = number;
export type RunId = number;
export type UserClass = 'maid' | 'other';
export type LinkKind = 'stairs' | 'escalator' | 'standard' | 'express' | 'service';
export type NodeRole = 'street-entrance' | 'subway-entrance' | 'flight-end' | 'shaft-stop';

export interface GraphNode {
  id: NodeId;
  level: Level;
  x: number;
  /** The walkable run the node stands in; nodes in the same run are joined by walking. */
  run: RunId;
  roles: NodeRole[];
}

export interface Link {
  to: NodeId;
  kind: LinkKind;
  /** The transport or shaft that provides the link. */
  via: EntityId;
  floors: number;
  maidsOnly: boolean;
}

export interface WalkableRun extends ColumnSpan {
  id: RunId;
  level: Level;
  nodes: NodeId[];
}

/** Enabled stops per shaft; a shaft without an entry stops everywhere its type allows. */
export type ShaftStops = ReadonlyMap<ShaftId, readonly Level[]>;

interface NodeLinks {
  forMaids: Link[];
  forOthers: Link[];
}

/**
 * The nodes and links route search runs on (routing sections 2 to 4 and 10). It is built from the
 * tower and rebuilt on build, demolish and stop changes; lookups never allocate.
 */
export class TransportGraph {
  private nodes: GraphNode[] = [];
  private links: NodeLinks[] = [];
  private runs: WalkableRun[] = [];
  private nodeByCell = new Map<string, NodeId>();
  private runsByLevel = new Map<Level, WalkableRun[]>();
  /** Grows on every rebuild so caches built on the graph know when to drop. */
  revision = 0;

  constructor(state: TowerState, stops: ShaftStops = shaftStopsOf(state)) {
    this.rebuild(state, stops);
  }

  rebuild(state: TowerState, stops: ShaftStops = shaftStopsOf(state)): void {
    this.revision += 1;
    this.nodes = [];
    this.links = [];
    this.runs = [];
    this.nodeByCell = new Map();
    this.runsByLevel = new Map();
    this.addRuns(state);
    this.addEntrances(state);
    this.addFlights(state);
    this.addShafts(state, stops);
  }

  get nodeCount(): number {
    return this.nodes.length;
  }

  node(id: NodeId): GraphNode {
    return this.nodes[id] as GraphNode;
  }

  nodeAtCell(level: Level, x: number): GraphNode | null {
    const id = this.nodeByCell.get(cellKey(level, x));
    return id === undefined ? null : this.node(id);
  }

  /** The links a person of this class can take from the node. */
  neighbours(id: NodeId, userClass: UserClass): readonly Link[] {
    const links = this.links[id] as NodeLinks;
    return userClass === 'maid' ? links.forMaids : links.forOthers;
  }

  run(id: RunId): WalkableRun {
    return this.runs[id] as WalkableRun;
  }

  runAtCell(level: Level, x: number): WalkableRun | null {
    return this.runsByLevel.get(level)?.find((run) => run.x0 <= x && x <= run.x1) ?? null;
  }

  private addRuns(state: TowerState): void {
    for (const key of Object.keys(state.grid.levels)) {
      const level = Number(key);
      const onLevel = walkableRuns(state, level).map((span) => {
        const run: WalkableRun = { ...span, id: this.runs.length, level, nodes: [] };
        this.runs.push(run);
        return run;
      });
      this.runsByLevel.set(level, onLevel);
    }
  }

  /** The node at the cell, created on first use. Null when no walkable run covers the cell. */
  private point(level: Level, x: number, role: NodeRole): NodeId | null {
    const existing = this.nodeByCell.get(cellKey(level, x));
    if (existing !== undefined) {
      this.node(existing).roles.push(role);
      return existing;
    }
    const run = this.runAtCell(level, x);
    if (!run) return null;
    const id = this.nodes.length;
    this.nodes.push({ id, level, x, run: run.id, roles: [role] });
    this.links.push({ forMaids: [], forOthers: [] });
    this.nodeByCell.set(cellKey(level, x), id);
    run.nodes.push(id);
    return id;
  }

  private addEntrances(state: TowerState): void {
    const mainLevel = TOWER_LAYOUT.mainLobbyFloor;
    const lobby = (state.grid.levels[mainLevel]?.structure ?? []).filter(
      (span) => span.kind === 'lobby',
    );
    if (lobby.length > 0) {
      const left = Math.min(...lobby.map((span) => span.x0));
      const right = Math.max(...lobby.map((span) => span.x1));
      this.point(mainLevel, left, 'street-entrance');
      if (right !== left) this.point(mainLevel, right, 'street-entrance');
    }
    for (const unit of Object.values(state.units)) {
      if (unit.type !== 'subway-station') continue;
      const { width } = UNIT_CATALOG[unit.type];
      this.point(walkableLevelOfUnit(unit), unit.x + Math.floor(width / 2), 'subway-entrance');
    }
  }

  private addFlights(state: TowerState): void {
    for (const transport of Object.values(state.transports)) {
      const above = levelAbove(transport.level);
      if (above === null) continue;
      const x = transport.x + FLIGHT_POINT_OFFSET;
      const lower = this.point(transport.level, x, 'flight-end');
      const upper = this.point(above, x, 'flight-end');
      if (lower === null || upper === null) continue;
      this.connect(lower, upper, {
        kind: transport.type,
        via: transport.id,
        floors: 1,
        maidsOnly: false,
      });
    }
  }

  private addShafts(state: TowerState, stops: ShaftStops): void {
    for (const shaft of Object.values(state.shafts)) {
      const column = shaftColumn(shaft);
      const reached: { level: Level; node: NodeId }[] = [];
      for (const level of enabledStops(shaft, stops.get(shaft.id))) {
        const node = this.point(level, column, 'shaft-stop');
        if (node !== null) reached.push({ level, node });
      }
      for (const [index, from] of reached.entries()) {
        for (const to of reached.slice(index + 1)) {
          this.connect(from.node, to.node, {
            kind: shaft.type,
            via: shaft.id,
            floors: Math.abs(floorIndex(from.level) - floorIndex(to.level)),
            maidsOnly: shaft.type === 'service',
          });
        }
      }
    }
  }

  private connect(a: NodeId, b: NodeId, link: Omit<Link, 'to'>): void {
    this.addLink(a, { ...link, to: b });
    this.addLink(b, { ...link, to: a });
  }

  /** Routing R-06 and R-07: maids take stairs and service shafts, everyone else takes all but service. */
  private addLink(from: NodeId, link: Link): void {
    const links = this.links[from] as NodeLinks;
    if (link.kind === 'stairs' || link.kind === 'service') links.forMaids.push(link);
    if (link.kind !== 'service') links.forOthers.push(link);
  }
}

/** The enabled stops each shaft has in the tower state. */
export function shaftStopsOf(state: TowerState): ShaftStops {
  return new Map(Object.values(state.shafts).map((shaft) => [shaft.id, shaft.stops]));
}

function cellKey(level: Level, x: number): string {
  return `${level}:${x}`;
}

/** Position counted in floors, with no level 0. */
export function floorIndex(level: Level): number {
  return isBasement(level) ? level : level - 1;
}

function shaftColumn(shaft: Shaft): number {
  const { width } = UNIT_CATALOG[SHAFT_UNIT_TYPES[shaft.type]];
  return shaft.x + Math.floor(width / 2);
}

/** Routing section 4: the chosen stops, or every level the shaft type allows by default. */
function enabledStops(shaft: Shaft, chosen: readonly Level[] | undefined): Level[] {
  const allowed = (level: Level) =>
    isInsideShaft(shaft, level) && (shaft.type !== 'express' || isExpressStop(level));
  const levels = chosen ?? shaftLevels(shaft);
  return [...new Set(levels.filter(allowed))].sort((a, b) => floorIndex(a) - floorIndex(b));
}
