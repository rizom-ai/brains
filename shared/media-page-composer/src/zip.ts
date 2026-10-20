import { crc32, deflateRawSync } from "node:zlib";

/** A file in a zip archive. */
export interface ZipEntry {
  /** The path inside the archive, ASCII. */
  name: string;
  data: Uint8Array;
  /** Stored uncompressed, as an EPUB's `mimetype` must be. */
  store?: boolean | undefined;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const STORED = 0;
const DEFLATED = 8;
/** Version 2.0: the minimum a reader needs for DEFLATE. */
const VERSION = 20;

interface ZipRecord {
  name: Uint8Array;
  body: Uint8Array;
  method: number;
  crc: number;
  size: number;
  offset: number;
}

/** A timestamp as zip stores it: MS-DOS time and date, in UTC. */
function dosDateTime(at: Date): { time: number; date: number } {
  return {
    time:
      (at.getUTCHours() << 11) |
      (at.getUTCMinutes() << 5) |
      Math.floor(at.getUTCSeconds() / 2),
    date:
      ((at.getUTCFullYear() - 1980) << 9) |
      ((at.getUTCMonth() + 1) << 5) |
      at.getUTCDate(),
  };
}

function header(
  signature: number,
  record: ZipRecord,
  stamp: { time: number; date: number },
  central: boolean,
): Uint8Array {
  const bytes = new Uint8Array((central ? 46 : 30) + record.name.length);
  const view = new DataView(bytes.buffer);
  const fields = central ? 2 : 0;
  view.setUint32(0, signature, true);
  if (central) view.setUint16(4, VERSION, true);
  view.setUint16(4 + fields, VERSION, true);
  view.setUint16(6 + fields, 0, true);
  view.setUint16(8 + fields, record.method, true);
  view.setUint16(10 + fields, stamp.time, true);
  view.setUint16(12 + fields, stamp.date, true);
  view.setUint32(14 + fields, record.crc, true);
  view.setUint32(18 + fields, record.body.length, true);
  view.setUint32(22 + fields, record.size, true);
  view.setUint16(26 + fields, record.name.length, true);
  if (central) view.setUint32(42, record.offset, true);
  bytes.set(record.name, central ? 46 : 30);
  return bytes;
}

/**
 * Write a zip archive with the runtime's native DEFLATE. The same entries
 * and timestamp yield the same bytes. Native compression leaves far less
 * resident memory behind than a JavaScript deflater does over a package of
 * thousands of small files.
 */
export function zip(entries: ZipEntry[], modified: Date): Uint8Array {
  const stamp = dosDateTime(modified);
  const encoder = new TextEncoder();
  const records = entries.reduce<ZipRecord[]>((all, entry) => {
    const previous = all.at(-1);
    const offset = previous
      ? previous.offset + 30 + previous.name.length + previous.body.length
      : 0;
    all.push({
      name: encoder.encode(entry.name),
      body: entry.store ? entry.data : deflateRawSync(entry.data, { level: 9 }),
      method: entry.store ? STORED : DEFLATED,
      crc: crc32(entry.data),
      size: entry.data.length,
      offset,
    });
    return all;
  }, []);
  const locals = records.flatMap((record) => [
    header(LOCAL_HEADER, record, stamp, false),
    record.body,
  ]);
  const centrals = records.map((record) =>
    header(CENTRAL_HEADER, record, stamp, true),
  );
  const centralStart = locals.reduce((sum, part) => sum + part.length, 0);
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, END_OF_CENTRAL_DIRECTORY, true);
  view.setUint16(8, records.length, true);
  view.setUint16(10, records.length, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralStart, true);
  return Buffer.concat([...locals, ...centrals, end]);
}
