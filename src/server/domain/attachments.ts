import "server-only";
import type { AttachmentKind } from "@/lib/enums";
import { isLocalDate, localInstant } from "@/lib/format";

// Attachments (feature 10, D-45, D-72 to D-75): what a file is, from its content, and the rules
// that follow from it. Pure functions; the disk and sharp live in src/server/files.

/** 25 MB per file (04 Security), checked while the body streams in. */
export { MAX_UPLOAD_BYTES } from "@/lib/uploads";

/** How many leading bytes `detectFormat` needs. */
export const SNIFF_BYTES = 64;

export type FileFormat = "jpeg" | "png" | "webp" | "pdf";

export const FORMATS: Record<FileFormat, { mimeType: string; extension: string; image: boolean }> =
  {
    jpeg: { mimeType: "image/jpeg", extension: "jpg", image: true },
    png: { mimeType: "image/png", extension: "png", image: true },
    webp: { mimeType: "image/webp", extension: "webp", image: true },
    pdf: { mimeType: "application/pdf", extension: "pdf", image: false },
  };

export type Detection =
  | { ok: true; format: FileFormat }
  /** `heic`: an HEIC/HEIF photo, refused with its own message (D-73). */
  | { ok: false; reason: "heic" | "unsupported" };

/** ISO-BMFF brands of HEIC/HEIF images (the iPhone's "High Efficiency" format). */
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * The format of a file from its first bytes (magic numbers), never from its name or the type
 * the browser sent. JPEG, PNG, WebP and PDF are accepted; HEIC is recognised to be refused
 * clearly; anything else is unsupported.
 */
export function detectFormat(head: Uint8Array): Detection {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return { ok: true, format: "jpeg" };
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { ok: true, format: "png" };
  }
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP") {
    return { ok: true, format: "webp" };
  }
  if (ascii(head, 0, 5) === "%PDF-") return { ok: true, format: "pdf" };
  if (head.length >= 12 && ascii(head, 4, 4) === "ftyp") {
    // Box size, then "ftyp", the major brand, a version, and the compatible brands.
    const boxSize = new DataView(head.buffer, head.byteOffset, head.byteLength).getUint32(0);
    const end = Math.min(head.length, Math.max(boxSize, 16));
    const brands = [ascii(head, 8, 4)];
    for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(ascii(head, offset, 4));
    if (brands.some((brand) => HEIF_BRANDS.has(brand))) return { ok: false, reason: "heic" };
  }
  return { ok: false, reason: "unsupported" };
}

/** The kind proposed for a new file (D-74): a photo for an image, an invoice for a PDF. */
export function defaultKind(format: FileFormat): AttachmentKind {
  return FORMATS[format].image ? "photo" : "invoice";
}

/** The kinds a file may be given in phase 1: a PDF is never a photo (shared with the browser). */
export { allowedKinds } from "@/lib/uploads";

/** Where the original goes, relative to the data directory: `uploads/YYYY/MM/<random>.<ext>` (UTC). */
export function storagePath(uploadedAt: number, random: string, format: FileFormat): string {
  if (!/^[a-z0-9]{16,64}$/.test(random)) throw new Error("Invalid random file name");
  const date = new Date(uploadedAt);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `uploads/${date.getUTCFullYear()}/${month}/${random}.${FORMATS[format].extension}`;
}

/**
 * The name shown for a file: the browser's name without any folder, control characters or
 * extra spaces, 200 characters at most. Never used on disk.
 */
export function cleanOriginalName(name: string | null | undefined, format: FileFormat): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 200) || `fichier.${FORMATS[format].extension}`;
}

// --- EXIF dates ----------------------------------------------------------------------------------

export type ExifDates = { dateTimeOriginal: string | null; offsetTimeOriginal: string | null };

const EXIF_IFD_POINTER = 0x8769;
const DATE_TIME_ORIGINAL = 0x9003;
const OFFSET_TIME_ORIGINAL = 0x9011;
const ASCII = 2;
const LONG = 4;

/**
 * Reads `DateTimeOriginal` and `OffsetTimeOriginal` from an EXIF block (a TIFF structure,
 * optionally behind the "Exif\0\0" header of JPEG files, as sharp's metadata returns it).
 * Anything malformed gives nulls rather than an error: the date then comes from elsewhere.
 */
export function readExifDates(exif: Uint8Array | null | undefined): ExifDates {
  const none = { dateTimeOriginal: null, offsetTimeOriginal: null };
  if (!exif || exif.length < 14) return none;
  const start = ascii(exif, 0, 6) === "Exif\0\0" ? 6 : 0;
  const view = new DataView(exif.buffer, exif.byteOffset + start, exif.byteLength - start);
  const order = ascii(exif, start, 2);
  if (order !== "II" && order !== "MM") return none;
  const little = order === "II";
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);

  type Entry = { type: number; count: number; valueAt: number };
  function entries(ifd: number): Map<number, Entry> {
    const found = new Map<number, Entry>();
    if (ifd + 2 > view.byteLength) return found;
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const at = ifd + 2 + i * 12;
      if (at + 12 > view.byteLength) break;
      const type = u16(at + 2);
      const n = u32(at + 4);
      // Values of 4 bytes or less sit in the entry itself; longer ones elsewhere.
      const size = type === ASCII ? n : 4;
      found.set(u16(at), { type, count: n, valueAt: size <= 4 ? at + 8 : u32(at + 8) });
    }
    return found;
  }
  function text(entry: Entry | undefined): string | null {
    if (!entry || entry.type !== ASCII || entry.valueAt + entry.count > view.byteLength) {
      return null;
    }
    const bytes = new Uint8Array(view.buffer, view.byteOffset + entry.valueAt, entry.count);
    return (
      ascii(bytes, 0, bytes.length)
        .replace(/\0[\s\S]*$/, "")
        .trim() || null
    );
  }

  try {
    if (u16(2) !== 42) return none;
    const pointer = entries(u32(4)).get(EXIF_IFD_POINTER);
    if (!pointer || pointer.type !== LONG) return none;
    const exifIfd = entries(u32(pointer.valueAt));
    return {
      dateTimeOriginal: text(exifIfd.get(DATE_TIME_ORIGINAL)),
      offsetTimeOriginal: text(exifIfd.get(OFFSET_TIME_ORIGINAL)),
    };
  } catch {
    return none;
  }
}

/**
 * The instant of an EXIF date: "2026:10:12 14:03:22" with its offset ("+02:00"), or read in
 * `timeZone` when the camera wrote none. Null when the date is missing or invalid.
 */
export function exifInstant(dates: ExifDates, timeZone: string): number | null {
  const match = dates.dateTimeOriginal?.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = `${year}-${month}-${day}`;
  const [h, m, s] = [Number(hour), Number(minute), Number(second)];
  if (!isLocalDate(date) || Number(year) < 1990 || h > 23 || m > 59 || s > 59) return null;
  const offset = dates.offsetTimeOriginal?.match(/^([+-])(\d{2}):(\d{2})$/);
  if (offset) {
    const sign = offset[1] === "-" ? -1 : 1;
    const offsetMs = sign * (Number(offset[2]) * 60 + Number(offset[3])) * 60_000;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), h, m, s) - offsetMs;
  }
  return localInstant(date, { hour: h, minute: m, second: s }, timeZone);
}

/**
 * When a photo was taken (03, H-11): the EXIF date, else the file's `lastModified` sent by the
 * browser (photos from the picker's camera have no EXIF date), else the upload time. A date
 * in the future, or before 1990, is not believed.
 */
export function resolveTakenAt(input: {
  exif: ExifDates;
  lastModified: number | null;
  uploadedAt: number;
  timeZone: string;
}): number {
  const plausible = (at: number | null): at is number =>
    at != null &&
    Number.isFinite(at) &&
    at >= Date.UTC(1990, 0, 1) &&
    at <= input.uploadedAt + 86_400_000;
  const fromExif = exifInstant(input.exif, input.timeZone);
  if (plausible(fromExif)) return fromExif;
  if (plausible(input.lastModified)) return Math.round(input.lastModified);
  return input.uploadedAt;
}

// --- Cover photos --------------------------------------------------------------------------------

/**
 * The cover of a bike, and the photo of a workshop item, is a photo of that element itself
 * (D-75): not one of its components', nor an invoice.
 */
export function canBeCover(attachment: { kind: AttachmentKind; ownedByTarget: boolean }): boolean {
  return attachment.kind === "photo" && attachment.ownedByTarget;
}

/** A new photo becomes the cover when the element has none yet (D-75). */
export function becomesCover(kind: AttachmentKind, currentCoverId: number | null): boolean {
  return kind === "photo" && currentCoverId == null;
}

/** After an edit: the cover stays only while the attachment is still a photo. */
export function keepsCover(kind: AttachmentKind): boolean {
  return kind === "photo";
}
