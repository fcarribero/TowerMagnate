import {
  isColumn,
  isLevel,
  TransportTypeSchema,
  type EntityId,
  type FloorPurchase,
  type Transport,
} from '@tower-magnate/shared';
import { isRecord, StateMigrationError } from './errors';

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isTransport(value: unknown): value is Transport {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    TransportTypeSchema.safeParse(value.type).success &&
    isColumn(value.x) &&
    isLevel(value.level) &&
    isNonNegativeInteger(value.paid) &&
    isNonNegativeInteger(value.placedAtStep)
  );
}

/** Saves from before stairs and escalators existed load with none. */
export function readTransports(raw: unknown): Record<EntityId, Transport> {
  if (raw === undefined) return {};
  if (!isRecord(raw)) {
    throw new StateMigrationError('State transports must be a record');
  }
  const transports: Record<EntityId, Transport> = {};
  for (const [id, transport] of Object.entries(raw)) {
    if (!isTransport(transport) || transport.id !== id || !/^t\d+$/.test(id)) {
      throw new StateMigrationError(`State transport ${id} is malformed`);
    }
    transports[id] = {
      id: transport.id,
      type: transport.type,
      x: transport.x,
      level: transport.level,
      paid: transport.paid,
      placedAtStep: transport.placedAtStep,
    };
  }
  return transports;
}

function isFloorPurchase(value: unknown): value is FloorPurchase {
  return (
    isRecord(value) &&
    isLevel(value.level) &&
    isColumn(value.x0) &&
    isColumn(value.x1) &&
    value.x0 <= value.x1 &&
    isNonNegativeInteger(value.paidPerCell) &&
    isNonNegativeInteger(value.placedAtStep)
  );
}

export function readFloorPurchases(raw: unknown): FloorPurchase[] {
  if (!Array.isArray(raw) || !raw.every(isFloorPurchase)) {
    throw new StateMigrationError('State floorPurchases must be a list of floor purchases');
  }
  return raw.map((purchase) => ({
    level: purchase.level,
    x0: purchase.x0,
    x1: purchase.x1,
    paidPerCell: purchase.paidPerCell,
    placedAtStep: purchase.placedAtStep,
  }));
}
