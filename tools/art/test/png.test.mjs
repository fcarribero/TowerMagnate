import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32, inflateSync } from 'node:zlib';
import { encodePng } from '../src/png.mjs';

function readChunks(png) {
  const chunks = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    const storedCrc = png.readUInt32BE(offset + 8 + length);
    chunks.push({ type, data, crcMatches: storedCrc === crc32(png.subarray(offset + 4, offset + 8 + length)) });
    offset += 12 + length;
  }
  return chunks;
}

test('writes a valid RGBA PNG whose pixels round-trip', () => {
  const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 20, 18, 24, 255]);
  const png = encodePng(2, 2, pixels);

  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunks = readChunks(png);
  assert.deepEqual(chunks.map((chunk) => chunk.type), ['IHDR', 'IDAT', 'IEND']);
  assert.ok(chunks.every((chunk) => chunk.crcMatches));

  const header = chunks[0].data;
  assert.equal(header.readUInt32BE(0), 2);
  assert.equal(header.readUInt32BE(4), 2);
  assert.equal(header[8], 8);
  assert.equal(header[9], 6);

  const rows = inflateSync(chunks[1].data);
  assert.deepEqual([...rows.subarray(1, 9)], [...pixels.subarray(0, 8)]);
  assert.deepEqual([...rows.subarray(10, 18)], [...pixels.subarray(8, 16)]);
});

test('same pixels give byte-identical files', () => {
  const pixels = new Uint8Array(16 * 16 * 4).map((_, i) => (i * 7) % 256);
  assert.deepEqual(encodePng(16, 16, pixels), encodePng(16, 16, pixels));
});

test('rejects a buffer that does not match the size', () => {
  assert.throws(() => encodePng(2, 2, new Uint8Array(15)), /Expected 16 RGBA bytes/);
  assert.throws(() => encodePng(0, 2, new Uint8Array(0)), /Invalid PNG size/);
});
