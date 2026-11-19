import { describe, expect, it, vi } from 'vitest';
import { clientMessage, PROTOCOL_VERSION, serverMessage } from '@tower-magnate/shared';
import { FakeSocket } from '../testing/fake-socket';
import type { DebugFrames, MessageContext, MessageHandlers } from '../port';
import { routeFrame } from './route';

const HELLO = JSON.stringify(clientMessage('hello', { protocol: PROTOCOL_VERSION }));
const BAD_COMMAND = JSON.stringify({
  v: 1,
  t: 'command',
  p: { id: 'x1', command: { type: 'configureShaft', shaftId: 's1', stops: [1] } },
});

function contextOf(socket: FakeSocket): MessageContext {
  return { socket, identity: { userId: 'alice', towerId: 'tower-1' }, join: () => {} };
}

describe('routeFrame', () => {
  it('a hello frame reaches the hello handler', async () => {
    const hello = vi.fn();
    const socket = new FakeSocket();

    await routeFrame(HELLO, contextOf(socket), { hello });

    expect(hello).toHaveBeenCalledOnce();
    expect(socket.sent).toEqual([]);
  });

  it('a command with a bad payload answers a commandResult with INVALID_COMMAND', async () => {
    const handlers: MessageHandlers = {
      invalidCommand: (id, { socket }) =>
        socket.send(
          JSON.stringify(
            serverMessage('commandResult', { id, ok: false, step: 0, error: 'INVALID_COMMAND' }),
          ),
        ),
    };
    const socket = new FakeSocket();

    await routeFrame(BAD_COMMAND, contextOf(socket), handlers);

    expect(socket.sent).toEqual([
      serverMessage('commandResult', { id: 'x1', ok: false, step: 0, error: 'INVALID_COMMAND' }),
    ]);
  });

  it('a debug frame goes to the debug frames', async () => {
    const handle = vi.fn(async () => {});
    const debugFrames: DebugFrames = { typeOf: () => 'debug.setMoney', handle };
    const socket = new FakeSocket();
    const context = contextOf(socket);

    await routeFrame('{"t":"debug.setMoney"}', context, {}, debugFrames);

    expect(handle).toHaveBeenCalledWith('{"t":"debug.setMoney"}', context);
  });

  it('text that is not JSON answers an error frame', async () => {
    const socket = new FakeSocket();

    await routeFrame('not json', contextOf(socket), {});

    expect(socket.sent).toEqual([
      serverMessage('error', { code: 'INVALID_COMMAND', message: 'Not a valid client message' }),
    ]);
  });
});
