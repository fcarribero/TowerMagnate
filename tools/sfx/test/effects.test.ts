import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { parseEffects, selectEffects, type Effect } from '../src/effects';

const click: Effect = {
  id: 'ui-click',
  prompt: 'click',
  duration: 0.2,
  loop: false,
  loudness: -20,
};
const hum: Effect = { id: 'elevator-move', prompt: 'hum', duration: 4, loop: true, loudness: -24 };

describe('parseEffects', () => {
  it('accepts a valid list', () => {
    assert.deepEqual(parseEffects({ effects: [click, hum] }), [click, hum]);
  });

  it('rejects a file without an effects array', () => {
    assert.throws(() => parseEffects([click]), /"effects" array/);
  });

  it('rejects ids that are not kebab-case', () => {
    assert.throws(() => parseEffects({ effects: [{ ...click, id: 'UI Click' }] }), /kebab-case/);
  });

  it('rejects an empty prompt', () => {
    assert.throws(() => parseEffects({ effects: [{ ...click, prompt: ' ' }] }), /prompt/);
  });

  it('rejects durations outside the API range', () => {
    assert.throws(() => parseEffects({ effects: [{ ...click, duration: 31 }] }), /duration/);
    assert.throws(() => parseEffects({ effects: [{ ...click, duration: 0 }] }), /duration/);
  });

  it('rejects a missing loop flag', () => {
    const withoutLoop: Partial<Effect> = { ...click };
    delete withoutLoop.loop;
    assert.throws(() => parseEffects({ effects: [withoutLoop] }), /loop/);
  });

  it('rejects an implausible loudness target', () => {
    assert.throws(() => parseEffects({ effects: [{ ...click, loudness: 0 }] }), /loudness/);
  });

  it('rejects duplicate ids', () => {
    assert.throws(() => parseEffects({ effects: [click, click] }), /duplicate effect id: ui-click/);
  });
});

describe('selectEffects', () => {
  it('returns every effect when no ids are given', () => {
    assert.deepEqual(selectEffects([click, hum], []), [click, hum]);
  });

  it('keeps only the requested ids', () => {
    assert.deepEqual(selectEffects([click, hum], ['elevator-move']), [hum]);
  });

  it('fails on an unknown id', () => {
    assert.throws(() => selectEffects([click], ['ui-clik']), /unknown effect id: ui-clik/);
  });
});
