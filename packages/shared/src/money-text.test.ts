import { describe, expect, it } from 'vitest';
import { formatMoney } from './money-text';

describe('formatMoney', () => {
  it('groups thousands with dots', () => {
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(500)).toBe('$500');
    expect(formatMoney(5_000)).toBe('$5.000');
    expect(formatMoney(2_000_000)).toBe('$2.000.000');
    expect(formatMoney(99_999_999)).toBe('$99.999.999');
  });

  it('puts the minus before the dollar sign', () => {
    expect(formatMoney(-12_500)).toBe('-$12.500');
  });

  it('drops decimals', () => {
    expect(formatMoney(1_234.6)).toBe('$1.235');
    expect(formatMoney(-0.2)).toBe('$0');
  });
});
