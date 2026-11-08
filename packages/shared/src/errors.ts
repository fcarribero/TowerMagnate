/**
 * Every reason the engine can give for rejecting a command. Codes are part of the wire protocol:
 * add new ones at the end, and never rename or remove one.
 */
export const ERROR_CODES = [
  'INVALID_COMMAND',
  'NEGATIVE_BALANCE',
  'INSUFFICIENT_FUNDS',
  'STAR_LOCKED',
  'BOMB_EVENT_ACTIVE',
  'LIMIT_REACHED',
  'CAR_LIMIT',
  'LAST_CAR',
  'OUT_OF_BOUNDS',
  'LEVEL_RESERVED',
  'LOBBY_LEVEL_ONLY',
  'LOBBY_FLOOR_NOT_ALLOWED',
  'ABOVE_GROUND_ONLY',
  'BASEMENT_ONLY',
  'CATHEDRAL_LEVEL_ONLY',
  'CATHEDRAL_POSITION',
  'SUBWAY_POSITION',
  'SPANS_GROUND',
  'EXPRESS_STOP_NOT_ALLOWED',
  'CELL_OCCUPIED',
  'NOTHING_TO_BUILD',
  'NO_SUPPORT',
  'NO_FLOOR',
  'TRANSPORT_LANDING',
  'LOBBY_HEIGHT_MISMATCH',
  'LOBBY_NOT_CONTIGUOUS',
  'ESCALATOR_FLOOR_TYPE',
  'SHAFT_TOO_TALL',
  'SHAFT_TOO_CLOSE',
  'RAMP_POSITION',
  'PARKING_NOT_CONNECTED',
  'RECYCLING_NOT_ADJACENT',
  'MAIN_LOBBY_PROTECTED',
  'SUPPORTS_STRUCTURE',
  'SHAFT_IN_USE',
  'NOTHING_TO_DEMOLISH',
  'UNKNOWN_ENTITY',
  'PRICE_LOCKED',
  'NOT_PRICED',
  'NOT_A_CINEMA',
  'EVENT_EXPIRED',
  'INVALID_CHOICE',
  'FOLLOW_LIMIT',
  'INVALID_SCHEDULE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Codes the server sends for socket problems. The engine never produces them. */
export const SOCKET_ERROR_CODES = [
  'PROTOCOL_MISMATCH',
  'NOT_AUTHENTICATED',
  'RATE_LIMITED',
  'NOT_ALLOWED',
] as const;

export type SocketErrorCode = (typeof SOCKET_ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return (ERROR_CODES as readonly unknown[]).includes(value);
}
