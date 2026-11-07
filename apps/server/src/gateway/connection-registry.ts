import { EventEmitter } from 'node:events';
import type { GatewaySocket, SocketIdentity } from './socket';

export interface TowerConnectionEvents {
  'tower-activated': [identity: SocketIdentity];
  'tower-deactivated': [identity: SocketIdentity];
}

export class ConnectionRegistry extends EventEmitter<TowerConnectionEvents> {
  private readonly socketsByTower = new Map<string, Set<GatewaySocket>>();
  private readonly identityBySocket = new Map<GatewaySocket, SocketIdentity>();

  add(socket: GatewaySocket, identity: SocketIdentity): void {
    if (this.identityBySocket.has(socket)) {
      return;
    }
    this.identityBySocket.set(socket, identity);
    const towerSockets = this.socketsByTower.get(identity.towerId) ?? new Set();
    towerSockets.add(socket);
    this.socketsByTower.set(identity.towerId, towerSockets);
    if (towerSockets.size === 1) {
      this.emit('tower-activated', identity);
    }
  }

  remove(socket: GatewaySocket): void {
    const identity = this.identityBySocket.get(socket);
    if (!identity) {
      return;
    }
    this.identityBySocket.delete(socket);
    const towerSockets = this.socketsByTower.get(identity.towerId);
    towerSockets?.delete(socket);
    if (towerSockets?.size === 0) {
      this.socketsByTower.delete(identity.towerId);
      this.emit('tower-deactivated', identity);
    }
  }

  isTowerActive(towerId: string): boolean {
    return this.socketsByTower.has(towerId);
  }

  socketsForTower(towerId: string): GatewaySocket[] {
    return [...(this.socketsByTower.get(towerId) ?? [])];
  }

  socketsForUser(userId: string): GatewaySocket[] {
    return this.allSockets().filter(
      (socket) => this.identityBySocket.get(socket)?.userId === userId,
    );
  }

  allSockets(): GatewaySocket[] {
    return [...this.identityBySocket.keys()];
  }
}
