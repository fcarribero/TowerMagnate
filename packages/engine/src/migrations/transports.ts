import {
  isColumn,
  isLevel,
  TransportTypeSchema,
  type EntityId,
  type Transport,
} from '@tower-magnate/shared';
import { isRecord, StateMigrationError } from './errors';

function isTransport(value: unknown): value is Transport {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    TransportTypeSchema.safeParse(value.type).success &&
    isColumn(value.x) &&
    isLevel(value.level)
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
    };
  }
  return transports;
}
