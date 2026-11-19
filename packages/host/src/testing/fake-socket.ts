import type { HostSocket, SocketIdentity, SocketSet } from '../port';

export class FakeSocket implements HostSocket {
  readonly sent: unknown[] = [];
  closeCode: number | undefined;

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(code?: number): void {
    this.closeCode = code;
  }
}

/** A minimal SocketSet for tests: sockets grouped by tower. */
export class FakeSocketSet implements SocketSet {
  private readonly identities = new Map<HostSocket, SocketIdentity>();

  add(socket: HostSocket, identity: SocketIdentity): void {
    this.identities.set(socket, identity);
  }

  remove(socket: HostSocket): void {
    this.identities.delete(socket);
  }

  socketsForTower(towerId: string): HostSocket[] {
    return [...this.identities].filter(([, i]) => i.towerId === towerId).map(([s]) => s);
  }

  allSockets(): HostSocket[] {
    return [...this.identities.keys()];
  }
}
