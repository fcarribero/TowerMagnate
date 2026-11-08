import { describe, expect, it } from 'vitest';
import { stepAtHour } from '../../render/timeOfDay';
import { deadlineText, decisionBody, decisionParams, optionLabel } from './decisionModel';

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

describe('fallbacks without server amounts', () => {
  it('drops the ransom from the button and the text', () => {
    expect(optionLabel('bomb', 'pay')).toBe('Pagar');
    expect(decisionBody('bomb', {})).not.toContain('{');
    expect(decisionBody('fire', {})).not.toContain('{');
  });

  it('names the ransom and the floor when known', () => {
    expect(decisionBody('bomb', { ransom: '$100.000' })).toContain('$100.000');
    expect(decisionBody('fire', { level: 12 })).toContain('piso 12');
  });
});

describe('decisionParams', () => {
  const base = { kind: 'decision', id: 'e1', deadlineStep: 9, options: [] } as const;

  it('formats the ransom of a bomb', () => {
    expect(decisionParams({ ...base, decision: 'bomb', options: ['pay'], ransom: 250000 })).toEqual(
      { ransom: '$250.000' },
    );
  });

  it('passes the floor of a fire', () => {
    expect(decisionParams({ ...base, decision: 'fire', options: ['burn'], level: 12 })).toEqual({
      level: 12,
    });
  });

  it('is empty when the server sent neither', () => {
    expect(decisionParams({ ...base, decision: 'bomb', options: ['pay'] })).toEqual({});
  });
});
