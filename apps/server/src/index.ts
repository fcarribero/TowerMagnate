import { STEPS_PER_DAY } from '@tower-magnate/engine';
import { PROTOCOL_VERSION } from '@tower-magnate/shared';

export interface ServerInfo {
  protocolVersion: number;
  stepsPerDay: number;
}

export function getServerInfo(): ServerInfo {
  return { protocolVersion: PROTOCOL_VERSION, stepsPerDay: STEPS_PER_DAY };
}
