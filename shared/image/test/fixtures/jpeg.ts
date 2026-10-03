/** A JPEG segment: marker, big-endian length (including itself), payload. */
export function jpegSegment(marker: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt8(0xff, 0);
  header.writeUInt8(marker, 1);
  header.writeUInt16BE(payload.byteLength + 2, 2);
  return Buffer.concat([header, payload]);
}

/** A baseline frame header for the given size. */
export function jpegFrame(width: number, height: number): Buffer {
  const payload = Buffer.alloc(15);
  payload.writeUInt8(8, 0);
  payload.writeUInt16BE(height, 1);
  payload.writeUInt16BE(width, 3);
  payload.writeUInt8(3, 5);
  return jpegSegment(0xc0, payload);
}

/** A JPEG of the given segments, closed by a scan and its end marker. */
export function jpeg(...segments: Buffer[]): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...segments,
    jpegSegment(0xda, Buffer.alloc(10)),
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** APP segments of at most 64 KiB each, together about `total` bytes. */
export function jpegMetadata(total: number): Buffer[] {
  const size = 65_000;
  return Array.from({ length: Math.ceil(total / size) }, (_, index) =>
    jpegSegment(0xe1 + (index % 14), Buffer.alloc(size, 0x20)),
  );
}
