import { describe, expect, it } from 'vitest';
import { COMMAND_TYPES, CommandSchema, ElevatorScheduleSchema } from './commands';
import { SOCKET_ERROR_CODES } from '../errors';
import { ErrorCodeSchema, ServerErrorCodeSchema } from './errors';
import {
  ClientMessageSchema,
  clientMessage,
  PROTOCOL_VERSION,
  ServerMessageSchema,
  serverMessage,
} from './messages';
import { LevelSchema, NameSchema } from './primitives';
import {
  sampleClientMessages,
  sampleCommands,
  sampleSchedule,
  sampleServerMessages,
} from './samples';

function throughJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function withCommand(command: unknown) {
  return { v: PROTOCOL_VERSION, t: 'command', p: { id: 'c1', command } };
}

describe('round trips through JSON', () => {
  it.each(sampleClientMessages.map((message) => [message.t, message] as const))(
    'client %s',
    (_type, message) => {
      expect(ClientMessageSchema.parse(throughJson(message))).toEqual(message);
    },
  );

  it.each(sampleServerMessages.map((message) => [message.t, message] as const))(
    'server %s',
    (_type, message) => {
      expect(ServerMessageSchema.parse(throughJson(message))).toEqual(message);
    },
  );

  it('has a sample for every command type and every message type', () => {
    expect(new Set(sampleCommands.map((command) => command.type))).toEqual(new Set(COMMAND_TYPES));
    expect(COMMAND_TYPES).toHaveLength(17);
    expect(new Set(sampleClientMessages.map((message) => message.t))).toEqual(
      new Set(ClientMessageSchema.options.map((option) => option.shape.t.value)),
    );
    expect(new Set(sampleServerMessages.map((message) => message.t))).toEqual(
      new Set(ServerMessageSchema.options.map((option) => option.shape.t.value)),
    );
  });
});

describe('rejected messages', () => {
  it('rejects an unknown message type', () => {
    const message = { v: PROTOCOL_VERSION, t: 'teleport', p: {} };
    expect(ClientMessageSchema.safeParse(message).success).toBe(false);
    expect(ServerMessageSchema.safeParse(message).success).toBe(false);
  });

  it('rejects a message without a version', () => {
    expect(ClientMessageSchema.safeParse({ t: 'ping', p: { clientTime: 1 } }).success).toBe(false);
  });

  it('accepts another version so the server can answer PROTOCOL_MISMATCH', () => {
    const hello = { v: PROTOCOL_VERSION + 1, t: 'hello', p: { protocol: PROTOCOL_VERSION + 1 } };
    expect(ClientMessageSchema.safeParse(hello).success).toBe(true);
  });

  it('rejects a lobby of height 4', () => {
    const command = { type: 'buildLobby', level: 1, x0: 0, x1: 10, height: 4 };
    expect(ClientMessageSchema.safeParse(withCommand(command)).success).toBe(false);
  });

  it('rejects level 0 and levels off the grid', () => {
    for (const level of [0, -11, 105, 1.5]) {
      const command = { type: 'buildFloor', level, x0: 0, x1: 10 };
      expect(ClientMessageSchema.safeParse(withCommand(command)).success).toBe(false);
    }
  });

  it('accepts the edge levels and columns', () => {
    for (const level of [-10, -1, 1, 104]) {
      expect(LevelSchema.safeParse(level).success).toBe(true);
    }
    expect(CommandSchema.safeParse({ type: 'buildFloor', level: 1, x0: 0, x1: 374 }).success).toBe(
      true,
    );
    expect(CommandSchema.safeParse({ type: 'buildFloor', level: 1, x0: 0, x1: 375 }).success).toBe(
      false,
    );
  });

  it('rejects a name of 25 characters and trims before counting', () => {
    const rename = (name: string) => ({ type: 'renameUnit', unitId: 'u1', name });
    expect(CommandSchema.safeParse(rename('a'.repeat(25))).success).toBe(false);
    expect(CommandSchema.safeParse(rename('a'.repeat(24))).success).toBe(true);
    expect(NameSchema.parse(`  ${'a'.repeat(24)}  `)).toBe('a'.repeat(24));
    expect(NameSchema.parse('   ')).toBe('');
  });

  it('rejects a schedule with 5 or 7 bands', () => {
    const fiveBands = { ...sampleSchedule, weekday: sampleSchedule.weekday.slice(0, 5) };
    const sevenBands = {
      ...sampleSchedule,
      weekend: [...sampleSchedule.weekend, sampleSchedule.weekend[0]],
    };
    expect(ElevatorScheduleSchema.safeParse(fiveBands).success).toBe(false);
    expect(ElevatorScheduleSchema.safeParse(sevenBands).success).toBe(false);
  });

  it('rejects an unknown error code', () => {
    const error = { v: PROTOCOL_VERSION, t: 'error', p: { code: 'OOPS', message: 'x' } };
    expect(ServerMessageSchema.safeParse(error).success).toBe(false);
  });

  it('keeps socket codes out of command results', () => {
    for (const code of SOCKET_ERROR_CODES) {
      expect(ServerErrorCodeSchema.safeParse(code).success).toBe(true);
      expect(ErrorCodeSchema.safeParse(code).success).toBe(false);
    }
  });

  it('rejects ids without their type prefix', () => {
    expect(CommandSchema.safeParse({ type: 'changeFilm', unitId: 's4' }).success).toBe(false);
    expect(CommandSchema.safeParse({ type: 'changeFilm', unitId: 'u0' }).success).toBe(false);
  });

  it('rejects buildUnit for types that have their own command', () => {
    for (const unitType of ['floor', 'lobby', 'stairs', 'express-elevator']) {
      const command = { type: 'buildUnit', unitType, x: 0, level: 1 };
      expect(CommandSchema.safeParse(command).success).toBe(false);
    }
  });

  it('rejects a structure row that is not 375 columns wide', () => {
    const delta = {
      v: PROTOCOL_VERSION,
      t: 'delta',
      p: { step: 1, cars: [], people: [], structure: [{ level: 1, structure: 'f'.repeat(374) }] },
    };
    expect(ServerMessageSchema.safeParse(delta).success).toBe(false);
  });
});

describe('delta lobby height', () => {
  const deltaWith = (mainLobbyHeight: number) =>
    ServerMessageSchema.safeParse({
      v: PROTOCOL_VERSION,
      t: 'delta',
      p: { step: 1, cars: [], people: [], mainLobbyHeight },
    }).success;

  it('accepts heights 1, 2 and 3 and rejects 0 and 4', () => {
    expect([1, 2, 3].map(deltaWith)).toEqual([true, true, true]);
    expect([0, 4].map(deltaWith)).toEqual([false, false]);
  });
});

describe('message builders', () => {
  it('stamp the current protocol version', () => {
    expect(clientMessage('ping', { clientTime: 5 })).toEqual({
      v: PROTOCOL_VERSION,
      t: 'ping',
      p: { clientTime: 5 },
    });
    const pong = serverMessage('pong', { clientTime: 5, serverStep: 9 });
    expect(ServerMessageSchema.parse(pong)).toEqual(pong);
  });
});
