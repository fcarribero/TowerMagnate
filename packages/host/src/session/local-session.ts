import type { TowerState } from '@tower-magnate/shared';
import { createDebugFrames } from '../debug/handler';
import type { HostSocket, MessageContext, SocketSet } from '../port';
import { TowerRunner } from '../runner/tower-runner';
import type { TowerStore } from '../runner/tower-store';
import { DeltaBroadcaster } from './delta-broadcaster';
import { towerSocketHandlers } from './handlers';
import { Inspections } from './inspections';
import { routeFrame } from './route';
import { Viewports } from './viewports';

export const LOCAL_TOWER_ID = 'local';

export interface LocalSessionOptions {
  state: TowerState;
  /** Debug and developer messages are answered only when true. */
  debug: boolean;
  /** Each server message, as the JSON text the WebSocket carried. */
  send: (data: string) => void;
  /** Called whenever the runner would have saved: after an accepted command and after a debug change. */
  onChange: () => void;
  now?: () => number;
}

/** One tower with one socket: what the Worker runs in place of the server. */
export class LocalSession {
  private readonly runner: TowerRunner;
  private readonly broadcaster: DeltaBroadcaster;
  private readonly inspections: Inspections;
  private readonly handlers: ReturnType<typeof towerSocketHandlers>;
  private readonly debugFrames: ReturnType<typeof createDebugFrames>;
  private readonly sockets: SocketSet;
  private readonly context: MessageContext;
  private readonly ready: Promise<void>;
  private markReady: () => void = () => {};
  private stops: (() => void)[] = [];
  private stopped = false;

  constructor(private readonly options: LocalSessionOptions) {
    const socket: HostSocket = {
      send: (data) => {
        if (!this.stopped) {
          options.send(data);
        }
      },
      close: () => {},
    };
    const store: TowerStore = {
      load: async () => options.state,
      save: async () => options.onChange(),
    };
    this.runner = new TowerRunner({ store, now: options.now });
    const viewports = new Viewports();
    this.broadcaster = new DeltaBroadcaster({ runner: this.runner, viewports });
    this.inspections = new Inspections({ runner: this.runner });
    this.handlers = towerSocketHandlers({
      runner: this.runner,
      viewports,
      broadcaster: this.broadcaster,
      inspections: this.inspections,
    });
    this.debugFrames = createDebugFrames({
      runner: this.runner,
      enabled: options.debug,
      isDeveloper: async () => options.debug,
    });
    this.sockets = { socketsForTower: () => [socket], allSockets: () => [socket] };
    this.context = {
      socket,
      identity: { userId: 'local', towerId: LOCAL_TOWER_ID },
      join: () => {},
    };
    this.ready = new Promise((resolve) => {
      this.markReady = resolve;
    });
  }

  /** Loads the state into the runner and starts the 100, 200 and 250 ms timers. */
  async start(): Promise<void> {
    await this.runner.resume(LOCAL_TOWER_ID);
    if (!this.stopped) {
      this.stops = [
        this.runner.start(),
        this.broadcaster.start(this.sockets),
        this.inspections.start(this.sockets),
      ];
    }
    this.markReady();
  }

  /** Routes one client frame. Frames that arrive before start() resolves wait for it. */
  async receive(data: string): Promise<void> {
    await this.ready;
    if (this.stopped) {
      return;
    }
    await routeFrame(data, this.context, this.handlers, this.debugFrames);
  }

  /** The state to save: caught up to now, with the real money when infinite money is on. */
  async savedState(): Promise<TowerState> {
    await this.ready;
    const state = await this.runner.savedStateOf(LOCAL_TOWER_ID);
    return state ?? this.options.state;
  }

  /** Stops every timer. Nothing is sent afterwards. */
  stop(): void {
    this.stopped = true;
    for (const stop of this.stops) {
      stop();
    }
    this.stops = [];
  }
}
