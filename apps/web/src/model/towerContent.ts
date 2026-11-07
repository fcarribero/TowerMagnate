import type { Level, UnitId } from '@tower-magnate/shared';

/** A unit as the client draws it. `floors` is only needed for shafts, whose height the player picks. */
export interface ContentUnit {
  id: string;
  type: UnitId;
  x: number;
  level: Level;
  floors?: number;
}

/** What the server sends about built cells: a 375 char row per level ('.' none, 'f' floor, 'l' lobby) and the units. */
export interface TowerContent {
  structure: ReadonlyMap<Level, string>;
  units: ReadonlyMap<string, ContentUnit>;
}

export interface ContentSnapshot {
  levels: Record<Level, { structure: string }>;
  units: readonly ContentUnit[];
}

export interface ContentDelta {
  structure?: readonly { level: Level; structure: string }[];
  unitsUpserted?: readonly ContentUnit[];
  unitsRemoved?: readonly string[];
}

type Listener = (content: TowerContent) => void;

/** The client-side copy of the tower's built cells, fed by snapshots and deltas. */
export class TowerContentStore {
  private structure = new Map<Level, string>();
  private units = new Map<string, ContentUnit>();
  private readonly listeners = new Set<Listener>();

  get content(): TowerContent {
    return { structure: this.structure, units: this.units };
  }

  applySnapshot(snapshot: ContentSnapshot): void {
    this.structure = new Map();
    for (const [level, row] of Object.entries(snapshot.levels)) {
      this.structure.set(Number(level), row.structure);
    }
    this.units = new Map(snapshot.units.map((unit) => [unit.id, unit]));
    this.notify();
  }

  applyDelta(delta: ContentDelta): void {
    const changed =
      (delta.structure?.length ?? 0) +
      (delta.unitsUpserted?.length ?? 0) +
      (delta.unitsRemoved?.length ?? 0);
    if (changed === 0) {
      return;
    }
    for (const row of delta.structure ?? []) {
      this.structure.set(row.level, row.structure);
    }
    for (const unit of delta.unitsUpserted ?? []) {
      this.units.set(unit.id, unit);
    }
    for (const id of delta.unitsRemoved ?? []) {
      this.units.delete(id);
    }
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const content = this.content;
    for (const listener of this.listeners) {
      listener(content);
    }
  }
}
