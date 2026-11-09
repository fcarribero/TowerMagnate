import { ClientMessageSchema, PROTOCOL_VERSION } from '@tower-magnate/shared';
import { describe, expect, it } from 'vitest';
import { debugTypeOf, DebugMessageSchema, MAX_FAST_FORWARD_STEPS } from './messages';

const parse = (t: string, p: object) => DebugMessageSchema.safeParse({ v: PROTOCOL_VERSION, t, p });

describe('debug messages', () => {
  it('accepts each command and fills in the reply id', () => {
    expect(parse('debug.forceEvent', { kind: 'bomb' }).data?.p.id).toBe('debug');
    expect(parse('debug.fastForward', { steps: MAX_FAST_FORWARD_STEPS }).success).toBe(true);
    expect(parse('debug.setClock', { day: 0, time: '09:00' }).success).toBe(true);
    expect(parse('debug.setMoney', { amount: -500 }).success).toBe(true);
    expect(parse('debug.loadScenario', { name: 'verticalSlice' }).success).toBe(true);
  });

  it('rejects unknown kinds and out of range values', () => {
    expect(parse('debug.forceEvent', { kind: 'flood' }).success).toBe(false);
    expect(parse('debug.fastForward', { steps: MAX_FAST_FORWARD_STEPS + 1 }).success).toBe(false);
    expect(parse('debug.fastForward', { steps: 0 }).success).toBe(false);
    expect(parse('debug.setClock', { day: 7, time: '09:00' }).success).toBe(false);
    expect(parse('debug.setClock', { day: 1, time: '24:00' }).success).toBe(false);
    expect(parse('debug.setMoney', { amount: 1.5 }).success).toBe(false);
    expect(parse('debug.loadScenario', { name: 'castle' }).success).toBe(false);
  });

  it('stays out of the shared client protocol', () => {
    const frame = { v: PROTOCOL_VERSION, t: 'debug.setMoney', p: { amount: 1 } };
    expect(ClientMessageSchema.safeParse(frame).success).toBe(false);
  });

  it('recognizes debug frames by type only', () => {
    expect(debugTypeOf('{"t":"debug.nothing","p":{}}')).toBe('debug.nothing');
    expect(debugTypeOf('{"t":"ping"}')).toBeNull();
    expect(debugTypeOf('not json')).toBeNull();
  });
});
