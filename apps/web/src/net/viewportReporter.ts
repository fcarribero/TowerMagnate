import { clientMessage, type ClientMessage } from '@tower-magnate/shared';
import { cameraViewport, type Camera, type ViewportRequest } from '../render/camera';

/** Levels above and below the visible ones whose people the server still sends. */
export const VIEWPORT_MARGIN_LEVELS = 2;
/**
 * The server accepts 4 viewports per second (engine-and-protocol.md 8.1). The
 * spacing is a little wider than 250 ms so network jitter cannot squeeze five
 * into one server-side second.
 */
export const VIEWPORT_INTERVAL_MS = 300;

export interface ViewportReporterOptions {
  /** Returns false when the socket is not open. */
  send(message: ClientMessage): boolean;
}

/**
 * Tells the server which part of the tower the camera shows, so it sends the
 * people there. Sends after every snapshot and whenever the visible range
 * changes, throttled, and always ends on the latest camera position.
 */
export class ViewportReporter {
  private latest: ViewportRequest | null = null;
  private lastSent: ViewportRequest | null = null;
  private lastSentAtMs = -Infinity;
  private snapshotWaiting = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: ViewportReporterOptions) {}

  cameraChanged(camera: Camera): void {
    this.latest = cameraViewport(camera, VIEWPORT_MARGIN_LEVELS);
    this.sendSoon();
  }

  /** A snapshot starts a new view on the server, which needs the viewport again. */
  snapshotReceived(): void {
    this.snapshotWaiting = true;
    this.sendSoon();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Sends now if the last send is old enough, otherwise once the interval ends, with the camera as it is then. */
  private sendSoon(): void {
    if (this.timer !== null || !this.hasSomethingToSend()) {
      return;
    }
    const wait = this.lastSentAtMs + VIEWPORT_INTERVAL_MS - Date.now();
    if (wait <= 0) {
      this.sendLatest();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.sendLatest();
    }, wait);
  }

  private hasSomethingToSend(): boolean {
    if (this.latest === null) {
      return false;
    }
    return this.snapshotWaiting || !sameRange(this.latest, this.lastSent);
  }

  private sendLatest(): void {
    if (this.latest === null || !this.hasSomethingToSend()) {
      return;
    }
    if (this.options.send(clientMessage('viewport', this.latest))) {
      this.lastSent = this.latest;
      this.lastSentAtMs = Date.now();
      this.snapshotWaiting = false;
    }
  }
}

function sameRange(a: ViewportRequest, b: ViewportRequest | null): boolean {
  return (
    b !== null &&
    a.levelFrom === b.levelFrom &&
    a.levelTo === b.levelTo &&
    a.xFrom === b.xFrom &&
    a.xTo === b.xTo
  );
}
