import { describe, expect, it } from 'vitest';
import { hasString, stringKeys, t } from './strings';

describe('strings', () => {
  it('returns the Spanish text for a key', () => {
    expect(t('ui.close')).toBe('Cerrar');
    expect(t('calendar.weekday.2')).toBe('Miércoles');
  });

  it('fills placeholders', () => {
    expect(t('ui.size', { w: 9, h: 1 })).toBe('9 x 1 casilleros');
    expect(t('ui.pricePerCell', { price: '$500' })).toBe('$500 por casillero');
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
      /^(ui|calendar|unit|category|tool|window|value|overlay|error|news|dialog|auth)\./;
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
});
