import type { ServerMessage } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { createCommandApi } from './commandApi';

const FLOOR = { type: 'buildFloor', level: 2, x0: 1, x1: 4 } as const;

function result(payload: object): ServerMessage {
  return { t: 'commandResult', p: payload } as ServerMessage;
}

describe('createCommandApi', () => {
  it('sends the command and resolves with the accepted cost', async () => {
    const sent: unknown[] = [];
    const api = createCommandApi({
      channel: {
        send: (message) => {
          sent.push(message);
          return true;
        },
      },
      newId: () => 'a1',
    });
    const outcome = api.send(FLOOR);
    expect(sent).toMatchObject([{ t: 'command', p: { id: 'a1', command: FLOOR } }]);
    api.receive(result({ id: 'a1', ok: true, step: 5, cost: 2000, refund: 0 }));
    await expect(outcome).resolves.toEqual({ ok: true, cost: 2000, refund: 0 });
  });

  it('resolves with the error code when the server refuses', async () => {
    const api = createCommandApi({ channel: { send: () => true }, newId: () => 'a2' });
    const outcome = api.send(FLOOR);
    api.receive(result({ id: 'a2', ok: false, step: 5, error: 'NO_SUPPORT' }));
    await expect(outcome).resolves.toEqual({ ok: false, error: 'NO_SUPPORT' });
  });

  it('fails at once when the socket is down', async () => {
    const told: unknown[] = [];
    const api = createCommandApi({
      channel: { send: () => false },
      onSent: (queued) => told.push(queued),
    });
    await expect(api.send(FLOOR)).resolves.toEqual({ ok: false, error: 'unknown' });
    expect(told).toEqual([]);
  });

  it('ignores answers for commands it does not know', () => {
    const api = createCommandApi({ channel: { send: () => true } });
    const unknownAnswer = result({ id: 'zz', ok: true, step: 1, cost: 1, refund: 0 });
    expect(() => api.receive(unknownAnswer)).not.toThrow();
  });
});
