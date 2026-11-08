import type { InspectData, ServerMessage } from '@tower-magnate/shared';

export type UnitInspectData = Extract<InspectData, { kind: 'unit' }>;
export type UnitInspect = Extract<UnitInspectData, { status: 'ok' }>;

export type ShaftInspect = Extract<InspectData, { kind: 'shaft' }>;

type Listener = () => void;
type OpenRequestListener = (id: string) => void;

/**
 * The latest `inspect` data per unit. The server only inspects one target at
 * a time, so a unit that is not in front keeps the data it last received.
 */
export class InspectStore {
  private readonly units = new Map<string, UnitInspectData>();
  private readonly listeners = new Set<Listener>();
  private readonly shafts = new Map<string, ShaftInspect>();
  private readonly openRequests = new Set<OpenRequestListener>();
  private readonly shaftOpenRequests = new Set<OpenRequestListener>();

  receive(message: ServerMessage): void {
    if (message.t !== 'inspect') {
      return;
    }
    if (message.p.kind === 'unit') {
      this.units.set(message.p.id, message.p);
    } else if (message.p.kind === 'shaft') {
      this.shafts.set(message.p.id, message.p);
    } else {
      return;
    }
    for (const listener of this.listeners) {
      listener();
    }
  }

  unit(unitId: string): UnitInspectData | undefined {
    return this.units.get(unitId);
  }

  shaft(shaftId: string): ShaftInspect | undefined {
    return this.shafts.get(shaftId);
  }

  forgetShaft(shaftId: string): void {
    this.shafts.delete(shaftId);
  }

  forget(unitId: string): void {
    this.units.delete(unitId);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The Lupa asks for a unit window; the window host answers. */
  requestUnitWindow(unitId: string): void {
    for (const listener of this.openRequests) {
      listener(unitId);
    }
  }

  onUnitWindowRequest(listener: OpenRequestListener): () => void {
    this.openRequests.add(listener);
    return () => {
      this.openRequests.delete(listener);
    };
  }

  /** The Lupa asks for an elevator window; the window host answers. */
  requestShaftWindow(shaftId: string): void {
    for (const listener of this.shaftOpenRequests) {
      listener(shaftId);
    }
  }

  onShaftWindowRequest(listener: OpenRequestListener): () => void {
    this.shaftOpenRequests.add(listener);
    return () => {
      this.shaftOpenRequests.delete(listener);
    };
  }
}
