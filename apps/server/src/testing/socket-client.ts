import { clientMessage, PROTOCOL_VERSION, type ServerMessage } from '@tower-magnate/shared';
import WebSocket from 'ws';

/** A test client for the tower socket that keeps every message it receives. */
export class TestSocketClient {
  readonly received: ServerMessage[] = [];
  closeCode: number | undefined;
  private readonly closed: Promise<number>;

  private constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => this.received.push(JSON.parse(String(data)) as ServerMessage));
    this.closed = new Promise((resolve) =>
      socket.once('close', (code) => {
        this.closeCode = code;
        resolve(code);
      }),
    );
  }

  static open(url: string, cookie?: string): Promise<TestSocketClient> {
    const socket = new WebSocket(url, { headers: cookie ? { cookie } : {} });
    const client = new TestSocketClient(socket);
    return new Promise((resolve, reject) => {
      socket.once('open', () => resolve(client));
      socket.once('error', reject);
    });
  }

  hello(protocol = PROTOCOL_VERSION): void {
    this.sendRaw(JSON.stringify(clientMessage('hello', { protocol })));
  }

  sendRaw(text: string): void {
    this.socket.send(text);
  }

  async next<T extends ServerMessage['t']>(type: T): Promise<Extract<ServerMessage, { t: T }>> {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const found = this.received.find((message) => message.t === type);
      if (found) {
        this.received.splice(this.received.indexOf(found), 1);
        return found as Extract<ServerMessage, { t: T }>;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`No "${type}" message arrived`);
  }

  waitForClose(): Promise<number> {
    return this.closed;
  }

  close(): Promise<number> {
    this.socket.close();
    return this.closed;
  }
}
