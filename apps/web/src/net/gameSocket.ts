import {
  clientMessage,
  PROTOCOL_VERSION,
  ServerMessageSchema,
  TOWER_SOCKET_PATH,
  type ClientMessage,
  type ServerMessage,
} from '@tower-magnate/shared';

export const CLOSE_NOT_AUTHENTICATED = 4401;
export const CLOSE_PROTOCOL_MISMATCH = 4409;

/** UI-44: a lost socket is retried every 2 real seconds. */
export const RETRY_DELAY_MS = 2_000;
export const PING_INTERVAL_MS = 2_000;
/** With pings every 2 s, this much silence means the connection is gone even if the browser has not noticed. */
export const SILENCE_LIMIT_MS = 6_000;

export type ConnectionStatus = 'connecting' | 'live' | 'retrying' | 'closed';

/** The part of the browser WebSocket the game socket uses, so tests can stand in for it. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
}

/** What the socket feeds. `ClientStore` fits. */
export interface MessageSink {
  receive(message: ServerMessage): void;
  reconnected(): void;
}

export interface GameSocketOptions {
  url: string;
  sink: MessageSink;
  createSocket?: (url: string) => SocketLike;
  /** Check every server message against the schema. Meant for development builds. */
  validate?: boolean;
  onStatus?: (status: ConnectionStatus) => void;
  /** The server closed for good (not authenticated or protocol mismatch). */
  onClosedForGood?: (code: number) => void;
}

const OPEN = 1;

/**
 * One WebSocket to the tower (engine-and-protocol.md 8.1). Says hello on every
 * open, hands server messages to the sink, pings to notice a dead link and
 * reconnects at a fixed delay. After a reconnect the sink is told, so it
 * drops what it had and waits for the new snapshot.
 */
export class GameSocket {
  private socket: SocketLike | null = null;
  private status: ConnectionStatus = 'closed';
  private hasBeenOpen = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeardAtMs = 0;
  private stopped = false;

  private readonly createSocket: (url: string) => SocketLike;

  constructor(private readonly options: GameSocketOptions) {
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  connect(): void {
    this.stopped = false;
    this.open();
  }

  /** Closes the socket and stops reconnecting. */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.dropSocket();
    this.setStatus('closed');
  }

  /** Asks the server for a fresh snapshot on the open socket. */
  resync(): void {
    this.sayHello();
  }

  send(message: ClientMessage): boolean {
    if (this.socket === null || this.socket.readyState !== OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  private open(): void {
    this.setStatus(this.hasBeenOpen ? 'retrying' : 'connecting');
    const socket = this.createSocket(this.options.url);
    socket.onopen = () => this.handleOpen();
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = (event) => this.handleClose(socket, event.code);
    this.socket = socket;
  }

  private handleOpen(): void {
    this.lastHeardAtMs = Date.now();
    this.startPinging();
    if (this.hasBeenOpen) {
      this.options.sink.reconnected();
    } else {
      this.hasBeenOpen = true;
      this.sayHello();
    }
    this.setStatus('live');
  }

  private handleMessage(data: unknown): void {
    this.lastHeardAtMs = Date.now();
    const message = this.parse(data);
    if (message !== null) {
      this.options.sink.receive(message);
    }
  }

  private handleClose(socket: SocketLike, code: number): void {
    if (socket !== this.socket) {
      return;
    }
    this.socket = null;
    this.stopPinging();
    if (this.stopped) {
      return;
    }
    if (code === CLOSE_NOT_AUTHENTICATED || code === CLOSE_PROTOCOL_MISMATCH) {
      this.stopped = true;
      this.setStatus('closed');
      this.options.onClosedForGood?.(code);
      return;
    }
    this.scheduleRetry();
  }

  private parse(data: unknown): ServerMessage | null {
    let json: unknown;
    try {
      json = JSON.parse(String(data));
    } catch {
      console.warn('Dropped a server message that is not JSON');
      return null;
    }
    if (!this.options.validate) {
      return json as ServerMessage;
    }
    const result = ServerMessageSchema.safeParse(json);
    if (!result.success) {
      console.warn('Dropped a server message that does not match the protocol', result.error);
      return null;
    }
    return result.data;
  }

  private sayHello(): void {
    this.send(clientMessage('hello', { protocol: PROTOCOL_VERSION }));
  }

  private scheduleRetry(): void {
    this.setStatus('retrying');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, RETRY_DELAY_MS);
  }

  private startPinging(): void {
    this.stopPinging();
    this.pingTimer = setInterval(() => this.pingOrGiveUp(), PING_INTERVAL_MS);
  }

  private pingOrGiveUp(): void {
    if (Date.now() - this.lastHeardAtMs > SILENCE_LIMIT_MS) {
      const silent = this.socket;
      this.dropSocket();
      this.stopPinging();
      if (silent !== null) {
        this.scheduleRetry();
      }
      return;
    }
    this.send(clientMessage('ping', { clientTime: performance.now() }));
  }

  private stopPinging(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopPinging();
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /** Forgets the current socket first, so its late close event is ignored. */
  private dropSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.close();
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.status) {
      return;
    }
    this.status = status;
    this.options.onStatus?.(status);
  }
}

/** The tower socket address on the page's own host, which Vite proxies to the server in development. */
export function gameSocketUrl(location: Pick<Location, 'protocol' | 'host'>): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${TOWER_SOCKET_PATH}`;
}
