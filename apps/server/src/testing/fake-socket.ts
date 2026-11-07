import { EventEmitter } from 'node:events';
import type { GatewaySocket } from '../gateway';

export class FakeSocket extends EventEmitter implements GatewaySocket {
  readonly sent: unknown[] = [];
  pings = 0;
  terminated = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  ping(): void {
    this.pings += 1;
  }

  terminate(): void {
    this.terminated = true;
    this.emit('close');
  }

  receive(text: string): void {
    this.emit('message', Buffer.from(text));
  }

  answerPing(): void {
    this.emit('pong');
  }

  close(): void {
    this.emit('close');
  }
}
