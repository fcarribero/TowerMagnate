import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { Effect } from '../src/effects';
import { buildRequestBody, requestSoundEffect, type FetchLike } from '../src/elevenlabs';

const click: Effect = {
  id: 'ui-click',
  prompt: 'a click',
  duration: 0.2,
  loop: false,
  loudness: -20,
};
const hum: Effect = {
  id: 'elevator-move',
  prompt: 'a hum',
  duration: 4,
  loop: true,
  loudness: -24,
};
const secret = 'sk_test_secret_value';

describe('buildRequestBody', () => {
  it('raises short effects to the API minimum of 0.5 s', () => {
    assert.equal(buildRequestBody(click).duration_seconds, 0.5);
  });

  it('passes the prompt, duration and loop flag', () => {
    const body = buildRequestBody(hum);
    assert.equal(body.text, 'a hum');
    assert.equal(body.duration_seconds, 4);
    assert.equal(body.loop, true);
  });
});

describe('requestSoundEffect', () => {
  it('sends the key in the header and returns the audio bytes', async () => {
    let seenUrl = '';
    let seenInit: RequestInit = {};
    const fakeFetch: FetchLike = async (url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    };
    const audio = await requestSoundEffect(click, secret, fakeFetch);
    assert.deepEqual([...audio], [1, 2, 3]);
    assert.match(seenUrl, /\/v1\/sound-generation\?output_format=mp3_44100_128$/);
    assert.equal((seenInit.headers as Record<string, string>)['xi-api-key'], secret);
    assert.ok(!seenUrl.includes(secret));
  });

  it('reports API errors without the key', async () => {
    const fakeFetch: FetchLike = async () =>
      new Response('{"detail":"quota_exceeded"}', { status: 401 });
    await assert.rejects(requestSoundEffect(click, secret, fakeFetch), (error: Error) => {
      assert.match(error.message, /ui-click: ElevenLabs returned 401: .*quota_exceeded/);
      assert.ok(!error.message.includes(secret));
      return true;
    });
  });

  it('rejects an empty response', async () => {
    const fakeFetch: FetchLike = async () => new Response(new Uint8Array(), { status: 200 });
    await assert.rejects(requestSoundEffect(click, secret, fakeFetch), /empty file/);
  });
});
