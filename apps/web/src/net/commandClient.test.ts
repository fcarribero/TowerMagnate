import type { ClientMessage } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { CommandClient } from './commandClient';

function clientWith(open = true) {
  const sent: ClientMessage[] = [];
  const client = new CommandClient({
    send: (message) => {
      sent.push(message);
      return open;
    },
  });
  return { client, sent };
}

describe('CommandClient', () => {
  it('settles a command with the result that has its id', async () => {
    const { client, sent } = clientWith();
    const result = client.setPrice('u1', 'low');
    const first = sent[0];
    expect(first).toMatchObject({
      t: 'command',
      p: { command: { type: 'setPrice', unitId: 'u1', price: 'low' } },
    });
    const id = first?.t === 'command' ? first.p.id : '';
    client.receive({
      v: 1,
      t: 'commandResult',
      p: { id, ok: true, step: 5, cost: 0, refund: 0 },
    });
    await expect(result).resolves.toMatchObject({ ok: true, step: 5 });
  });

  it('gives each command its own id', () => {
    const { client, sent } = clientWith();
    void client.changeFilm('u1');
    void client.renameUnit('u1', 'Estudio');
    const ids = sent.map((message) => (message.t === 'command' ? message.p.id : ''));
    expect(new Set(ids).size).toBe(2);
  });

  it('fails a command at once when the socket is not open', async () => {
    const { client } = clientWith(false);
    await expect(client.changeFilm('u1')).resolves.toMatchObject({ ok: false });
  });

  it('fails waiting commands when the socket drops', async () => {
    const { client } = clientWith();
    const result = client.changeFilm('u1');
    client.abandonPending();
    await expect(result).resolves.toMatchObject({ ok: false });
  });

  it('sends the inspect target', () => {
    const { client, sent } = clientWith();
    client.inspect({ kind: 'unit', id: 'u3' });
    client.inspect(null);
    expect(sent.map((message) => message.p)).toEqual([
      { target: { kind: 'unit', id: 'u3' } },
      { target: null },
    ]);
  });
});
