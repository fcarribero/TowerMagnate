import { crc32, deflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOR_TYPE_RGBA = 6;
const FILTER_NONE = 0;

function chunk(type, data) {
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

function headerChunk(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.writeUInt8(8, 8);
  data.writeUInt8(COLOR_TYPE_RGBA, 9);
  return chunk('IHDR', data);
}

function rowsWithFilterBytes(width, height, rgba) {
  const rowLength = width * 4;
  const rows = Buffer.alloc((rowLength + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowLength + 1);
    rows[rowStart] = FILTER_NONE;
    rgba.copy(rows, rowStart + 1, y * rowLength, (y + 1) * rowLength);
  }
  return rows;
}

// Output depends only on the pixels: no timestamps or text chunks.
export function encodePng(width, height, rgba) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`Invalid PNG size ${width}x${height}`);
  }
  const pixels = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  if (pixels.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA bytes, got ${pixels.length}`);
  }
  const compressed = deflateSync(rowsWithFilterBytes(width, height, pixels), { level: 9 });
  return Buffer.concat([
    PNG_SIGNATURE,
    headerChunk(width, height),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
