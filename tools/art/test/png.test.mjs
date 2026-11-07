import { crc32, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng } from '../src/png.mjs';

function readChunks(png) {
  const chunks = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    const storedCrc = png.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(png.subarray(offset + 4, offset + 8 + length));
    chunks.push({ type, data, crcMatches: storedCrc === actualCrc });
    offset += 12 + length;
  }
  return chunks;
}

describe('encodePng', () => {
  it('writes a valid RGBA PNG whose pixels round-trip', () => {
    const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 20, 18, 24, 255]);
    const png = encodePng(2, 2, pixels);

    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunks = readChunks(png);
    expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(chunks.every((chunk) => chunk.crcMatches)).toBe(true);

    const header = chunks[0].data;
    expect(header.readUInt32BE(0)).toBe(2);
    expect(header.readUInt32BE(4)).toBe(2);
    expect(header[8]).toBe(8);
    expect(header[9]).toBe(6);

    const rows = inflateSync(chunks[1].data);
    expect([...rows.subarray(1, 9)]).toEqual([...pixels.subarray(0, 8)]);
    expect([...rows.subarray(10, 18)]).toEqual([...pixels.subarray(8, 16)]);
  });

  it('gives byte-identical files for the same pixels', () => {
    const pixels = new Uint8Array(16 * 16 * 4).map((_, i) => (i * 7) % 256);
    expect(encodePng(16, 16, pixels)).toEqual(encodePng(16, 16, pixels));
  });

  it('rejects a buffer that does not match the size', () => {
    expect(() => encodePng(2, 2, new Uint8Array(15))).toThrow(/Expected 16 RGBA bytes/);
    expect(() => encodePng(0, 2, new Uint8Array(0))).toThrow(/Invalid PNG size/);
  });
});
