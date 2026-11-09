export interface FrameSample {
  /** Time since the previous frame. */
  frameMs: number;
  drawCalls: number;
  /** Used JS heap, when the browser reports it. */
  heapBytes: number | null;
}

export interface FrameReport {
  frames: number;
  fps: number;
  p95FrameMs: number;
  maxDrawCalls: number;
  meanDrawCalls: number;
  heapStartBytes: number | null;
  heapNowBytes: number | null;
  /** Heap growth since the first sample after warm-up, as a share of it. */
  heapGrowth: number | null;
}

/** Collects frame samples and sums them up for the perf overlay and for scripts. */
export class FrameMeter {
  private readonly window: FrameSample[] = [];
  private frames = 0;
  private maxDrawCalls = 0;
  private heapStartBytes: number | null = null;
  private heapNowBytes: number | null = null;

  /** Only the last `windowSize` frames count towards fps and frame times. */
  constructor(private readonly windowSize = 600) {}

  add(sample: FrameSample): void {
    this.frames += 1;
    this.window.push(sample);
    if (this.window.length > this.windowSize) {
      this.window.shift();
    }
    this.maxDrawCalls = Math.max(this.maxDrawCalls, sample.drawCalls);
    if (sample.heapBytes !== null) {
      this.heapStartBytes ??= sample.heapBytes;
      this.heapNowBytes = sample.heapBytes;
    }
  }

  report(): FrameReport {
    const frameTimes = this.window.map((sample) => sample.frameMs).sort((a, b) => a - b);
    const totalMs = frameTimes.reduce((sum, ms) => sum + ms, 0);
    const p95Index = Math.min(frameTimes.length - 1, Math.floor(frameTimes.length * 0.95));
    const drawCalls = this.window.reduce((sum, sample) => sum + sample.drawCalls, 0);
    const { heapStartBytes, heapNowBytes } = this;
    return {
      frames: this.frames,
      fps: totalMs === 0 ? 0 : (frameTimes.length * 1000) / totalMs,
      p95FrameMs: frameTimes[p95Index] ?? 0,
      maxDrawCalls: this.maxDrawCalls,
      meanDrawCalls: this.window.length === 0 ? 0 : drawCalls / this.window.length,
      heapStartBytes,
      heapNowBytes,
      heapGrowth:
        heapStartBytes === null || heapNowBytes === null
          ? null
          : (heapNowBytes - heapStartBytes) / heapStartBytes,
    };
  }
}
