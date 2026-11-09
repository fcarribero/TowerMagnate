import { describe, expect, it } from 'vitest';
import { FrameMeter } from './frameMeter';

describe('FrameMeter', () => {
  it('reports fps, the 95th percentile frame time and draw calls', () => {
    const meter = new FrameMeter();
    for (let frame = 0; frame < 95; frame++)
      meter.add({ frameMs: 10, drawCalls: 40, heapBytes: null });
    for (let frame = 0; frame < 5; frame++)
      meter.add({ frameMs: 30, drawCalls: 60, heapBytes: null });
    const report = meter.report();
    expect(report.fps).toBeCloseTo(1000 / 11);
    expect(report.p95FrameMs).toBe(30);
    expect(report.maxDrawCalls).toBe(60);
    expect(report.meanDrawCalls).toBe(41);
    expect(report.heapGrowth).toBeNull();
  });

  it('counts only the last frames towards fps', () => {
    const meter = new FrameMeter(2);
    meter.add({ frameMs: 100, drawCalls: 1, heapBytes: null });
    meter.add({ frameMs: 10, drawCalls: 1, heapBytes: null });
    meter.add({ frameMs: 10, drawCalls: 1, heapBytes: null });
    expect(meter.report()).toMatchObject({ frames: 3, fps: 100 });
  });

  it('measures heap growth from the first sample', () => {
    const meter = new FrameMeter();
    meter.add({ frameMs: 16, drawCalls: 1, heapBytes: 100 });
    meter.add({ frameMs: 16, drawCalls: 1, heapBytes: 104 });
    expect(meter.report().heapGrowth).toBeCloseTo(0.04);
  });
});
