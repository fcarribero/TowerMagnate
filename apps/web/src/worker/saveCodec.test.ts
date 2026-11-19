// @vitest-environment node
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { gzipText } from './saveCodec';

describe('gzipText', () => {
  it('round trips through gunzip', async () => {
    const text = 'tower state '.repeat(200) + 'ñandú';
    const bytes = await gzipText(text);
    expect(bytes.length).toBeLessThan(text.length);
    expect(gunzipSync(bytes).toString('utf8')).toBe(text);
  });
});
