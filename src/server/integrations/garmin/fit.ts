import "server-only";
import { crc32, inflateRawSync } from "node:zlib";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";

// Garmin's download (`/download-service/files/activity/{id}`) answers a ZIP holding one
// `<id>_ACTIVITY.fit` (Verified 2026-11-03). This reads that entry with node:zlib, so no
// dependency: stored or deflated entries only, a size cap against ZIP bombs, the CRC checked,
// and the FIT header checked from its content (".FIT" at bytes 8 to 11).

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export class FitArchiveError extends Error {}

/** True when the bytes start like a FIT file (header size 12 or 14, then ".FIT"). */
export function isFitFile(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 14 &&
    (bytes[0] === 12 || bytes[0] === 14) &&
    String.fromCharCode(...bytes.subarray(8, 12)) === ".FIT"
  );
}

/** The first `.fit` entry of a ZIP, or throws `FitArchiveError`. */
export function fitFromZip(
  archive: Buffer,
  maxBytes = MAX_UPLOAD_BYTES,
): { name: string; data: Buffer } {
  // The end-of-central-directory record: the last 22 bytes, unless a comment follows it.
  let end = -1;
  for (let at = archive.length - 22; at >= Math.max(0, archive.length - 22 - 0xffff); at--) {
    if (archive.readUInt32LE(at) === EOCD) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new FitArchiveError("Not a ZIP archive");
  const entries = archive.readUInt16LE(end + 10);
  let at = archive.readUInt32LE(end + 16);

  for (let i = 0; i < entries; i++) {
    if (at + 46 > archive.length || archive.readUInt32LE(at) !== CENTRAL) {
      throw new FitArchiveError("Broken central directory");
    }
    const flags = archive.readUInt16LE(at + 8);
    const method = archive.readUInt16LE(at + 10);
    const crc = archive.readUInt32LE(at + 16);
    const compressedSize = archive.readUInt32LE(at + 20);
    const size = archive.readUInt32LE(at + 24);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const localAt = archive.readUInt32LE(at + 42);
    const name = archive.toString(
      flags & (1 << 11) ? "utf8" : "latin1",
      at + 46,
      at + 46 + nameLength,
    );
    at += 46 + nameLength + extraLength + commentLength;
    if (!/\.fit$/i.test(name)) continue;

    if (size > maxBytes) throw new FitArchiveError("FIT file too large");
    if (flags & 1) throw new FitArchiveError("Encrypted entry");
    if (localAt + 30 > archive.length || archive.readUInt32LE(localAt) !== LOCAL) {
      throw new FitArchiveError("Broken local header");
    }
    const dataAt =
      localAt + 30 + archive.readUInt16LE(localAt + 26) + archive.readUInt16LE(localAt + 28);
    const raw = archive.subarray(dataAt, dataAt + compressedSize);
    if (raw.length !== compressedSize) throw new FitArchiveError("Truncated entry");
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try {
        data = inflateRawSync(raw, { maxOutputLength: maxBytes });
      } catch {
        throw new FitArchiveError("Cannot inflate the entry");
      }
    } else throw new FitArchiveError(`Unsupported compression ${method}`);
    if (data.length !== size || crc32(data) !== crc) throw new FitArchiveError("CRC mismatch");
    if (!isFitFile(data)) throw new FitArchiveError("Not a FIT file");
    return { name: name.split("/").pop() ?? name, data };
  }
  throw new FitArchiveError("No FIT file in the archive");
}
