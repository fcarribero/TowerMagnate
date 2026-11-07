import { describe, expect, it } from 'vitest';
import { ERROR_CODES, isErrorCode, SOCKET_ERROR_CODES } from './errors';

describe('error codes', () => {
  it('are unique upper snake case strings', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of [...ERROR_CODES, ...SOCKET_ERROR_CODES]) {
      expect(code).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
    }
  });

  it('keep socket codes apart from engine codes', () => {
    for (const code of SOCKET_ERROR_CODES) {
      expect(isErrorCode(code)).toBe(false);
    }
  });

  it('recognises engine codes only', () => {
    expect(isErrorCode('UNKNOWN_ENTITY')).toBe(true);
    expect(isErrorCode('unknown_entity')).toBe(false);
    expect(isErrorCode(42)).toBe(false);
  });

  it('never change once published', () => {
    expect(ERROR_CODES).toMatchInlineSnapshot(`
      [
        "INVALID_COMMAND",
        "NEGATIVE_BALANCE",
        "INSUFFICIENT_FUNDS",
        "STAR_LOCKED",
        "BOMB_EVENT_ACTIVE",
        "LIMIT_REACHED",
        "CAR_LIMIT",
        "LAST_CAR",
        "OUT_OF_BOUNDS",
        "LEVEL_RESERVED",
        "LOBBY_LEVEL_ONLY",
        "LOBBY_FLOOR_NOT_ALLOWED",
        "ABOVE_GROUND_ONLY",
        "BASEMENT_ONLY",
        "CATHEDRAL_LEVEL_ONLY",
        "CATHEDRAL_POSITION",
        "SUBWAY_POSITION",
        "SPANS_GROUND",
        "EXPRESS_STOP_NOT_ALLOWED",
        "CELL_OCCUPIED",
        "NOTHING_TO_BUILD",
        "NO_SUPPORT",
        "NO_FLOOR",
        "TRANSPORT_LANDING",
        "LOBBY_HEIGHT_MISMATCH",
        "LOBBY_NOT_CONTIGUOUS",
        "ESCALATOR_FLOOR_TYPE",
        "SHAFT_TOO_TALL",
        "SHAFT_TOO_CLOSE",
        "RAMP_POSITION",
        "PARKING_NOT_CONNECTED",
        "RECYCLING_NOT_ADJACENT",
        "MAIN_LOBBY_PROTECTED",
        "SUPPORTS_STRUCTURE",
        "SHAFT_IN_USE",
        "NOTHING_TO_DEMOLISH",
        "UNKNOWN_ENTITY",
        "PRICE_LOCKED",
        "NOT_PRICED",
        "NOT_A_CINEMA",
        "EVENT_EXPIRED",
        "INVALID_CHOICE",
        "FOLLOW_LIMIT",
        "INVALID_SCHEDULE",
      ]
    `);
  });
});
