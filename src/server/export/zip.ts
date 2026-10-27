import "server-only";
import { crc32, deflateRawSync } from "node:zlib";

/*
 * A minimal ZIP writer (PKWARE APPNOTE 6.3), enough for the export (feature 12): entries are
 * written one after the other as a stream, each one compressed in memory, then the central
 * directory. No ZIP64: an entry or the whole archive over 4 GiB, or more than 65 535 entries,
 * is refused. Built on node:zlib, so no dependency.
 */

export type ZipEntry = {
  /** Path inside the archive, with "/" separators. */
  name: string;
  data: Uint8Array;
  /** false for files that are already compressed (JPEG, PDF…): stored as they are. */
  compress?: boolean;
};

/** Local wall-clock time of the entries (ZIP times carry no time zone). */
export type ZipTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const MAX_32 = 0xffff_ffff;
const MAX_ENTRIES = 0xffff;
const UTF8_FLAG = 1 << 11;
const VERSION = 20; // 2.0: deflate

function dosTime({ hour, minute, second }: ZipTime) {
  return (hour << 11) | (minute << 5) | Math.floor(second / 2);
}

function dosDate({ year, month, day }: ZipTime) {
  return (Math.max(0, year - 1980) << 9) | (month << 5) | day;
}

type Written = {
  name: Uint8Array;
  crc: number;
  method: number;
  compressedSize: number;
  size: number;
  offset: number;
};

/** The archive as a sequence of chunks; entries are consumed lazily. */
export async function* zip(
  entries: Iterable<ZipEntry> | AsyncIterable<ZipEntry>,
  time: ZipTime,
): AsyncGenerator<Uint8Array> {
  const written: Written[] = [];
  const encoder = new TextEncoder();
  const date = dosDate(time);
  const clock = dosTime(time);
  let offset = 0;

  for await (const entry of entries) {
    if (written.length >= MAX_ENTRIES) throw new Error("Too many entries for a ZIP without ZIP64");
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const deflated = entry.compress === false ? null : deflateRawSync(entry.data);
    // Keep the smaller one: tiny or incompressible files are stored.
    const useDeflate = deflated != null && deflated.length < entry.data.length;
    const body = useDeflate ? deflated : entry.data;
    if (entry.data.length > MAX_32 || offset + 30 + name.length + body.length > MAX_32) {
      throw new Error("Archive too large for a ZIP without ZIP64");
    }
    const record: Written = {
      name,
      crc,
      method: useDeflate ? 8 : 0,
      compressedSize: body.length,
      size: entry.data.length,
      offset,
    };

    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true); // local file header signature
    header.setUint16(4, VERSION, true);
    header.setUint16(6, UTF8_FLAG, true);
    header.setUint16(8, record.method, true);
    header.setUint16(10, clock, true);
    header.setUint16(12, date, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, record.compressedSize, true);
    header.setUint32(22, record.size, true);
    header.setUint16(26, name.length, true);
    header.setUint16(28, 0, true); // no extra field
    yield new Uint8Array(header.buffer);
    yield name;
    yield body;
    offset += 30 + name.length + body.length;
    written.push(record);
  }

  const directoryStart = offset;
  for (const record of written) {
    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true); // central directory header signature
    header.setUint16(4, (3 << 8) | VERSION, true); // made by: Unix, so the attributes below apply
    header.setUint16(6, VERSION, true);
    header.setUint16(8, UTF8_FLAG, true);
    header.setUint16(10, record.method, true);
    header.setUint16(12, clock, true);
    header.setUint16(14, date, true);
    header.setUint32(16, record.crc, true);
    header.setUint32(20, record.compressedSize, true);
    header.setUint32(24, record.size, true);
    header.setUint16(28, record.name.length, true);
    header.setUint16(30, 0, true); // extra field
    header.setUint16(32, 0, true); // comment
    header.setUint16(34, 0, true); // disk number
    header.setUint16(36, 0, true); // internal attributes
    header.setUint32(38, (0o100644 << 16) >>> 0, true); // regular file, rw-r--r--
    header.setUint32(42, record.offset, true);
    yield new Uint8Array(header.buffer);
    yield record.name;
    offset += 46 + record.name.length;
  }
  if (offset > MAX_32) throw new Error("Archive too large for a ZIP without ZIP64");

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // end of central directory signature
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, written.length, true);
  end.setUint16(10, written.length, true);
  end.setUint32(12, offset - directoryStart, true);
  end.setUint32(16, directoryStart, true);
  end.setUint16(20, 0, true);
  yield new Uint8Array(end.buffer);
}
