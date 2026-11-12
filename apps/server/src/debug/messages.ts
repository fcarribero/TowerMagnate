import { MONEY_CAP } from '@tower-magnate/shared';
import { z } from 'zod';

export const DEBUG_MESSAGE_PREFIX = 'debug.';
export const MAX_FAST_FORWARD_STEPS = 8_640;
export const MAX_CLOCK_JUMP_DAYS = 400;

export const DEBUG_EVENT_KINDS = [
  'bomb',
  'fire',
  'vip',
  'santa',
  'wedding',
  'infestation',
] as const;
export type DebugEventKind = (typeof DEBUG_EVENT_KINDS)[number];

export const DEBUG_SCENARIOS = ['verticalSlice', 'eventShowcase'] as const;
export type DebugScenario = (typeof DEBUG_SCENARIOS)[number];

const DEFAULT_REPLY_ID = 'debug';

function debugMessage<T extends string, P extends z.ZodRawShape>(type: T, payload: P) {
  return z.object({
    v: z.int().positive(),
    t: z.literal(`${DEBUG_MESSAGE_PREFIX}${type}`),
    p: z.object({ id: z.string().min(1).max(64).default(DEFAULT_REPLY_ID), ...payload }),
  });
}

type ClockPayload = { day: number; year?: number; month?: number };

function isWeekdayOrCalendarDate({ day, year, month }: ClockPayload): boolean {
  if (year === undefined && month === undefined) return day <= 6;
  return year !== undefined && month !== undefined && day >= 1;
}

/**
 * Dev-only socket messages. They live in the server on purpose: the shared protocol, and so the
 * client build, never learns about them.
 */
export const DebugMessageSchema = z.discriminatedUnion('t', [
  debugMessage('forceEvent', {
    kind: z.enum(DEBUG_EVENT_KINDS),
    /** The dirty hotel room an infestation starts in. */
    unitId: z.string().min(1).max(64).optional(),
  }),
  debugMessage('fastForward', { steps: z.int().min(1).max(MAX_FAST_FORWARD_STEPS) }),
  debugMessage('setClock', {
    /** A weekday (0 is Monday) without `year` and `month`, a day of the month with them. */
    day: z.int().min(0).max(31),
    year: z.int().min(1).optional(),
    month: z.int().min(1).max(12).optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).refine(
    (message) => isWeekdayOrCalendarDate(message.p),
    'Give a weekday, or a year, month and day of the month',
  ),
  debugMessage('setMoney', { amount: z.int().min(-MONEY_CAP).max(MONEY_CAP) }),
  debugMessage('loadScenario', { name: z.enum(DEBUG_SCENARIOS) }),
]);

export type DebugMessage = z.infer<typeof DebugMessageSchema>;

/** The message type of a raw frame when it is a debug message, whether or not its payload is valid. */
export function debugTypeOf(rawData: unknown): string | null {
  try {
    const parsed: unknown = JSON.parse(String(rawData));
    const type = (parsed as { t?: unknown } | null)?.t;
    return typeof type === 'string' && type.startsWith(DEBUG_MESSAGE_PREFIX) ? type : null;
  } catch {
    return null;
  }
}
