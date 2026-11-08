import type { InspectData, ServerMessage } from '@tower-magnate/shared';

export type UnitInspect = Extract<InspectData, { kind: 'unit' }>;

type Listener = () => void;
type OpenRequestListener = (unitId: string) => void;

/**
 * The latest `inspect` data per unit. The server only inspects one target at
 * a time, so a unit that is not in front keeps the data it last received.
 */
export class InspectStore {
  private readonly units = new Map<string, UnitInspect>();
  private readonly listeners = new Set<Listener>();
  private readonly openRequests = new Set<OpenRequestListener>();

  receive(message: ServerMessage): void {
    if (message.t !== 'inspect' || message.p.kind !== 'unit') {
      return;
    }
    this.units.set(message.p.id, message.p);
    for (const listener of this.listeners) {
      listener();
    }
  }

  unit(unitId: string): UnitInspect | undefined {
    return this.units.get(unitId);
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
}
