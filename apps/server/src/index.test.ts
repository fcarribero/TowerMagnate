import { describe, expect, it } from 'vitest';
import { getServerInfo } from './index';

describe('getServerInfo', () => {
  it('reports values from the engine and shared packages', () => {
    expect(getServerInfo()).toEqual({ protocolVersion: 1, stepsPerDay: 8640 });
  });
});
