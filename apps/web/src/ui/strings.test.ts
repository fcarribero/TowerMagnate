import {
  UNIT_CATALOG,
  UNIT_TYPES,
  type ErrorCode,
  type SocketErrorCode,
} from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { errorText, hasString, stringKeys, t } from './strings';

// Typed as a full record so a new ErrorCode in shared fails the typecheck until it is listed here.
const ERROR_CODES: Readonly<Record<ErrorCode | SocketErrorCode, true>> = {
  INVALID_COMMAND: true,
  NOT_PRICED: true,
  NEGATIVE_BALANCE: true,
  INSUFFICIENT_FUNDS: true,
  STAR_LOCKED: true,
  BOMB_EVENT_ACTIVE: true,
  LIMIT_REACHED: true,
  CAR_LIMIT: true,
  LAST_CAR: true,
  OUT_OF_BOUNDS: true,
  LEVEL_RESERVED: true,
  LOBBY_LEVEL_ONLY: true,
  LOBBY_FLOOR_NOT_ALLOWED: true,
  ABOVE_GROUND_ONLY: true,
  BASEMENT_ONLY: true,
  CATHEDRAL_LEVEL_ONLY: true,
  CATHEDRAL_POSITION: true,
  SUBWAY_POSITION: true,
  SPANS_GROUND: true,
  EXPRESS_STOP_NOT_ALLOWED: true,
  CELL_OCCUPIED: true,
  NOTHING_TO_BUILD: true,
  NO_SUPPORT: true,
  NO_FLOOR: true,
  TRANSPORT_LANDING: true,
  LOBBY_HEIGHT_MISMATCH: true,
  LOBBY_NOT_CONTIGUOUS: true,
  ESCALATOR_FLOOR_TYPE: true,
  SHAFT_TOO_TALL: true,
  SHAFT_TOO_CLOSE: true,
  RAMP_POSITION: true,
  PARKING_NOT_CONNECTED: true,
  RECYCLING_NOT_ADJACENT: true,
  MAIN_LOBBY_PROTECTED: true,
  SUPPORTS_STRUCTURE: true,
  SHAFT_IN_USE: true,
  NOTHING_TO_DEMOLISH: true,
  UNKNOWN_ENTITY: true,
  PRICE_LOCKED: true,
  NOT_A_CINEMA: true,
  EVENT_EXPIRED: true,
  INVALID_CHOICE: true,
  FOLLOW_LIMIT: true,
  INVALID_SCHEDULE: true,
  PROTOCOL_MISMATCH: true,
  NOT_AUTHENTICATED: true,
  RATE_LIMITED: true,
};

describe('strings', () => {
  it('returns the Spanish text for a key', () => {
    expect(t('ui.close')).toBe('Cerrar');
    expect(t('calendar.weekday.2')).toBe('Miércoles');
    expect(t('category.commerce-and-entertainment')).toBe('Comercio y entretenimiento');
  });

  it('fills placeholders', () => {
    expect(t('ui.size', { w: 9, h: 1 })).toBe('9 x 1 casilleros');
    expect(t('ui.pricePerCell', { price: '$500' })).toBe('$500 por casillero');
    expect(t('dialog.deadlineOtherDay', { weekday: 'martes', time: '13:00' })).toBe(
      'Respondé antes del martes 13:00',
    );
  });

  it('leaves a placeholder without a value as written', () => {
    expect(t('ui.levelFloor')).toBe('Piso {n}');
  });

  it('knows which keys exist', () => {
    expect(hasString('ui.accept')).toBe(true);
    expect(hasString('ui.nothing')).toBe(false);
    expect(hasString('toString')).toBe(false);
  });

  it('follows the key patterns of the spec', () => {
    const pattern =
      /^(ui|calendar|unit|category|tool|window|value|overlay|error|news|dialog|auth|stars)\.[\w.-]+$/;
    for (const key of stringKeys()) {
      expect(key).toMatch(pattern);
    }
  });

  it('has seven weekdays and twelve months', () => {
    const keys = stringKeys();
    expect(keys.filter((key) => key.startsWith('calendar.weekday.'))).toHaveLength(7);
    expect(keys.filter((key) => key.startsWith('calendar.weekdayShort.'))).toHaveLength(7);
    expect(keys.filter((key) => key.startsWith('calendar.month.'))).toHaveLength(12);
  });

  it('has an error text for every engine and socket error code in shared', () => {
    for (const code of Object.keys(ERROR_CODES)) {
      expect(hasString(`error.${code}`), code).toBe(true);
    }
  });

  it('has a unit text equal to the catalog name for every unit', () => {
    for (const unitType of UNIT_TYPES) {
      const key = `unit.${unitType}`;
      expect(hasString(key), key).toBe(true);
      expect(hasString(key) && t(key)).toBe(UNIT_CATALOG[unitType].name);
    }
  });

  it('falls back to the generic message for an unknown error code', () => {
    expect(errorText('CELL_OCCUPIED')).toBe('El lugar está ocupado.');
    expect(errorText('SOMETHING_NEW')).toBe('No se pudo hacer.');
  });

  it('keeps every text free of stray spaces and empty values', () => {
    for (const key of stringKeys()) {
      const text = t(key);
      expect(text.trim(), key).toBe(text);
      expect(text.length, key).toBeGreaterThan(0);
    }
  });
});
