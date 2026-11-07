import { describe, expect, it } from 'vitest';
import { checkHealth } from './health';

describe('checkHealth', () => {
  it('reports ok when the database answers', async () => {
    const report = await checkHealth('1.2.3', async () => {});
    expect(report).toEqual({ status: 'ok', version: '1.2.3', database: 'ok' });
  });

  it('reports degraded when the database query fails', async () => {
    const report = await checkHealth('1.2.3', async () => {
      throw new Error('connection refused');
    });
    expect(report).toEqual({ status: 'degraded', version: '1.2.3', database: 'unreachable' });
  });
});
