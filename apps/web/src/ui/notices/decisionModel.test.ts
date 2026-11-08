import { describe, expect, it } from 'vitest';
import { stepAtHour } from '../../render/timeOfDay';
import { deadlineText, optionLabel } from './decisionModel';

describe('deadlineText', () => {
  it('names only the time on the same day', () => {
    expect(deadlineText(stepAtHour(10), stepAtHour(13))).toBe('Respondé antes de las 13:00');
  });

  it('adds the weekday on another day', () => {
    expect(deadlineText(stepAtHour(23), stepAtHour(25))).toBe('Respondé antes del Martes 01:00');
  });
});

describe('optionLabel', () => {
  it('words the bomb and fire options', () => {
    expect(optionLabel('bomb', 'pay', { ransom: '$100.000' })).toBe('Pagar $100.000');
    expect(optionLabel('bomb', 'refuse')).toBe('No pagar');
    expect(optionLabel('fire', 'helicopter')).toBe('Llamar al helicóptero ($500.000)');
    expect(optionLabel('fire', 'burn')).toBe('No llamar');
  });
});
