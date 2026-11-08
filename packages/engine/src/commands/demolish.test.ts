import { describe, it } from 'vitest';

describe('demolish', () => {
  it.todo('refunds the full paid amount 359 steps after placement');
  it.todo('refunds nothing at 360 steps or after the unit was used');
  it.todo('caps the refund at $99,999,999');
  it.todo('charges the sale price of a sold condo, even into negative balance');
  it.todo('ends the lease and removes people homed or working in the unit');
  it.todo('rejects an empty cell with NOTHING_TO_DEMOLISH');
  it.todo('rejects any main lobby cell with MAIN_LOBBY_PROTECTED');
  it.todo('turns sky lobby columns into floor');
  it.todo('rejects floor under a unit with CELL_OCCUPIED');
  it.todo('rejects floor under another floor, or a basement floor above another, with SUPPORTS_STRUCTURE');
  it.todo('rejects S1 ramp when S2 has a ramp with RAMP_POSITION');
  it.todo('rejects a shaft or car with riders with SHAFT_IN_USE');
  it.todo('rejects removing the last car with LAST_CAR');
  it.todo('leaves no grid cell, unit, shaft or person pointing at a removed id');
});
