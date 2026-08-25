import { deflateSync } from "zlib";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.length + 8);
  return chunk;
}

/** Create a deterministic RGB PNG without an external image dependency. */
export function createTestPng(width: number, height: number): Promise<Buffer> {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;

  const rowLength = width * 3 + 1;
  const pixels = Buffer.alloc(rowLength * height);
  for (let row = 0; row < height; row++) {
    const offset = row * rowLength;
    pixels[offset] = 0;
    for (let column = 0; column < width; column++) {
      const pixel = offset + 1 + column * 3;
      pixels[pixel] = 128;
      pixels[pixel + 1] = 64;
      pixels[pixel + 2] = 32;
    }
  }

  return Promise.resolve(
    Buffer.concat([
      PNG_SIGNATURE,
      pngChunk("IHDR", header),
      pngChunk("IDAT", deflateSync(pixels)),
      pngChunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
