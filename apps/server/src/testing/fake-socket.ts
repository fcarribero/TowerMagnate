import { EventEmitter } from 'node:events';
import { FakeSocket as HostFakeSocket } from '@tower-magnate/host/testing';
import type { GatewaySocket } from '../gateway';

/** The host fake plus what a gateway socket has: events, ping and terminate. */
export class FakeSocket extends HostFakeSocket implements GatewaySocket {
  private readonly events = new EventEmitter();
  pings = 0;
  terminated = false;

  on(event: 'message', listener: (data: unknown) => void): this;
  on(event: 'pong' | 'close', listener: () => void): this;
  on(event: string, listener: (...args: never[]) => void): this {
    this.events.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    return this.events.emit(event, ...args);
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

  override close(code?: number): void {
    super.close(code);
    this.emit('close');
  }
}
