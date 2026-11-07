import { z } from 'zod';
import { CommandResultSchema, QueuedCommandSchema } from './commands';
import { ServerErrorCodeSchema } from './errors';
import {
  ColumnSchema,
  LevelSchema,
  PersonEntityIdSchema,
  ShaftEntityIdSchema,
  StepSchema,
  UnitEntityIdSchema,
} from './primitives';
import { ClientEventSchema, DeltaSchema, InspectDataSchema, SnapshotSchema } from './views';

export const PROTOCOL_VERSION = 1;

/**
 * `v` is any positive version so a client on another version still parses;
 * the server answers its `hello` with PROTOCOL_MISMATCH.
 */
function envelope<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.object({ v: z.int().positive(), t: z.literal(type), p: payload });
}

export const ViewportSchema = z.object({
  levelFrom: LevelSchema,
  levelTo: LevelSchema,
  xFrom: ColumnSchema,
  xTo: ColumnSchema,
});

export const InspectTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unit'), id: UnitEntityIdSchema }),
  z.object({ kind: z.literal('person'), id: PersonEntityIdSchema }),
  z.object({ kind: z.literal('shaft'), id: ShaftEntityIdSchema }),
  z.object({ kind: z.literal('finances') }),
]);

const ClientTimeSchema = z.number().nonnegative();

export const ClientMessageSchema = z.discriminatedUnion('t', [
  envelope('hello', z.object({ protocol: z.int().positive() })),
  envelope('command', QueuedCommandSchema),
  envelope('viewport', ViewportSchema),
  envelope('inspect', z.object({ target: InspectTargetSchema.nullable() })),
  envelope('ping', z.object({ clientTime: ClientTimeSchema })),
]);

export const ServerMessageSchema = z.discriminatedUnion('t', [
  envelope('snapshot', SnapshotSchema),
  envelope('delta', DeltaSchema),
  envelope('commandResult', CommandResultSchema),
  envelope('events', z.object({ events: z.array(ClientEventSchema) })),
  envelope('inspect', InspectDataSchema),
  envelope('error', z.object({ code: ServerErrorCodeSchema, message: z.string() })),
  envelope('pong', z.object({ clientTime: ClientTimeSchema, serverStep: StepSchema })),
]);

export type Viewport = z.infer<typeof ViewportSchema>;
export type InspectTarget = z.infer<typeof InspectTargetSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ClientMessageType = ClientMessage['t'];
export type ServerMessageType = ServerMessage['t'];

/** The envelope of one message type, for example `Envelope<ServerMessage, 'delta'>`. */
export type Envelope<M extends { t: string }, T extends M['t']> = Extract<M, { t: T }>;

export function clientMessage<T extends ClientMessageType>(
  t: T,
  p: Envelope<ClientMessage, T>['p'],
): Envelope<ClientMessage, T> {
  return { v: PROTOCOL_VERSION, t, p } as Envelope<ClientMessage, T>;
}

export function serverMessage<T extends ServerMessageType>(
  t: T,
  p: Envelope<ServerMessage, T>['p'],
): Envelope<ServerMessage, T> {
  return { v: PROTOCOL_VERSION, t, p } as Envelope<ServerMessage, T>;
}
