import { describe, expect, it } from 'vitest';
import { STEPS_PER_DAY } from './clock';
import type { NewsId } from '@tower-magnate/shared';
import { isNewsAllowed, rememberNews, type NewsMemory, type NewsTarget } from './news-limit';

const GAP = 360;

function emittedAt(step: number, key: NewsId, target: NewsTarget): NewsMemory {
  return rememberNews({}, key, target, step);
}

describe('news rate limit (messages.md 4)', () => {
  it('drops the same key and unit within 359 steps and allows it at 360', () => {
    const memory = emittedAt(1_000, 'news.officeLeft', { unitId: 'u4' });
    expect(isNewsAllowed(memory, 'news.officeLeft', { unitId: 'u4' }, 1_000 + GAP - 1)).toBe(false);
    expect(isNewsAllowed(memory, 'news.officeLeft', { unitId: 'u4' }, 1_000 + GAP)).toBe(true);
  });

  it('allows the same key for another unit at once', () => {
    const memory = emittedAt(1_000, 'news.officeLeft', { unitId: 'u4' });
    expect(isNewsAllowed(memory, 'news.officeLeft', { unitId: 'u5' }, 1_001)).toBe(true);
  });

  it('scopes level keys by level', () => {
    const memory = emittedAt(1_000, 'news.cockroaches', { params: { level: 12 } });
    expect(isNewsAllowed(memory, 'news.cockroaches', { params: { level: 12 } }, 1_010)).toBe(false);
    expect(isNewsAllowed(memory, 'news.cockroaches', { params: { level: 13 } }, 1_010)).toBe(true);
  });

  it('allows a daily key once per game day from 00:00', () => {
    const lateMonday = STEPS_PER_DAY - 100;
    const memory = emittedAt(5_000, 'news.medicalFull', {});
    expect(isNewsAllowed(memory, 'news.medicalFull', {}, lateMonday)).toBe(false);
    expect(isNewsAllowed(memory, 'news.medicalFull', {}, STEPS_PER_DAY)).toBe(true);
  });

  it('still applies the gap to a daily key across midnight', () => {
    const memory = emittedAt(STEPS_PER_DAY - 10, 'news.medicalFull', {});
    expect(isNewsAllowed(memory, 'news.medicalFull', {}, STEPS_PER_DAY + 10)).toBe(false);
  });
});
