import { describe, expect, it } from 'vitest';
import { checkHealth } from './health';

describe('checkHealth', () => {
  it('reports ok when the database answers', async () => {
    const report = await checkHealth(async () => {});
    expect(report).toEqual({ status: 'ok', database: 'ok' });
  });

  it('reports degraded when the database query fails', async () => {
    const report = await checkHealth(async () => {
      throw new Error('connection refused');
    });
    expect(report).toEqual({ status: 'degraded', database: 'unreachable' });
  });
});
