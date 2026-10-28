import { describe, expect, it } from "vitest";
import {
  allowedKinds,
  becomesCover,
  canBeCover,
  cleanOriginalName,
  defaultKind,
  detectFormat,
  exifInstant,
  keepsCover,
  readExifDates,
  resolveTakenAt,
  storagePath,
} from "./attachments";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])),
  );

/** An ISO-BMFF `ftyp` box with these brands. */
function ftyp(major: string, ...compatible: string[]) {
  const size = 16 + compatible.length * 4;
  return bytes(0, 0, 0, size, "ftyp", major, 0, 0, 0, 0, ...compatible);
}

/**
 * A little- or big-endian TIFF block: IFD0 pointing to an Exif IFD with DateTimeOriginal and,
 * optionally, OffsetTimeOriginal. Shaped like the EXIF of an iPhone photo.
 */
function exifBlock(date: string | null, offset: string | null, little = true, header = true) {
  const out: number[] = [];
  const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) =>
    little
      ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24]
      : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  const tags: [number, string][] = [];
  if (date) tags.push([0x9003, `${date}\0`]);
  if (offset) tags.push([0x9011, `${offset}\0`]);
  // TIFF header (8) + IFD0 with one entry (2 + 12 + 4) = 26; then the Exif IFD.
  const exifIfd = 26;
  const valuesAt = exifIfd + 2 + tags.length * 12 + 4;
  out.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8));
  out.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfd), ...u32(0));
  out.push(...u16(tags.length));
  let at = valuesAt;
  for (const [tag, value] of tags) {
    out.push(...u16(tag), ...u16(2), ...u32(value.length));
    out.push(...(value.length <= 4 ? [...bytes(value.padEnd(4, "\0"))] : u32(at)));
    if (value.length > 4) at += value.length;
  }
  out.push(...u32(0));
  for (const [, value] of tags) if (value.length > 4) out.push(...bytes(value));
  const tiff = new Uint8Array(out);
  return header ? new Uint8Array([...bytes("Exif", 0, 0), ...tiff]) : tiff;
}

describe("detectFormat", () => {
  it("recognises the accepted formats from their content", () => {
    expect(detectFormat(bytes(0xff, 0xd8, 0xff, 0xe1))).toEqual({ ok: true, format: "jpeg" });
    expect(detectFormat(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0))).toEqual({
      ok: true,
      format: "png",
    });
    expect(detectFormat(bytes("RIFF", 1, 2, 3, 4, "WEBPVP8 "))).toEqual({
      ok: true,
      format: "webp",
    });
    expect(detectFormat(bytes("%PDF-1.7\n"))).toEqual({ ok: true, format: "pdf" });
  });

  it("recognises HEIC by its major or compatible brands, to refuse it clearly (D-73)", () => {
    expect(detectFormat(ftyp("heic", "mif1", "heic"))).toEqual({ ok: false, reason: "heic" });
    expect(detectFormat(ftyp("mif1", "heic"))).toEqual({ ok: false, reason: "heic" });
    expect(detectFormat(ftyp("isom", "iso2", "mif1"))).toEqual({ ok: false, reason: "heic" });
  });

  it("refuses anything else, whatever its name would say", () => {
    expect(detectFormat(ftyp("avif", "avif"))).toEqual({ ok: false, reason: "unsupported" });
    expect(detectFormat(ftyp("isom", "mp41"))).toEqual({ ok: false, reason: "unsupported" });
    expect(detectFormat(bytes("GIF89a"))).toEqual({ ok: false, reason: "unsupported" });
    expect(detectFormat(bytes("PK", 3, 4))).toEqual({ ok: false, reason: "unsupported" });
    expect(detectFormat(bytes("<svg"))).toEqual({ ok: false, reason: "unsupported" });
    expect(detectFormat(new Uint8Array())).toEqual({ ok: false, reason: "unsupported" });
  });
});

describe("kinds", () => {
  it("proposes a photo for an image and an invoice for a PDF (D-74)", () => {
    expect(defaultKind("jpeg")).toBe("photo");
    expect(defaultKind("webp")).toBe("photo");
    expect(defaultKind("pdf")).toBe("invoice");
  });

  it("never offers photo for a PDF, nor the phase 2 track", () => {
    expect(allowedKinds(true)).toEqual(["photo", "invoice", "manual", "other"]);
    expect(allowedKinds(false)).toEqual(["invoice", "manual", "other"]);
  });
});

describe("storagePath and names", () => {
  it("stores under uploads/YYYY/MM in UTC with a random name", () => {
    const at = Date.UTC(2026, 9, 31, 23, 30);
    expect(storagePath(at, "a".repeat(32), "jpeg")).toBe(`uploads/2026/10/${"a".repeat(32)}.jpg`);
    expect(storagePath(Date.UTC(2027, 0, 1), "0123456789abcdef", "pdf")).toBe(
      "uploads/2027/01/0123456789abcdef.pdf",
    );
    expect(() => storagePath(at, "../../etc/passwd", "pdf")).toThrow();
  });

  it("cleans the browser's file name, which is never used on disk", () => {
    expect(cleanOriginalName("C:\\Users\\x\\Facture vélo.pdf", "pdf")).toBe("Facture vélo.pdf");
    expect(cleanOriginalName("../../a\u0000b\n.jpg", "jpeg")).toBe("ab.jpg");
    expect(cleanOriginalName("   ", "jpeg")).toBe("fichier.jpg");
    expect(cleanOriginalName(null, "pdf")).toBe("fichier.pdf");
    expect(cleanOriginalName("x".repeat(300), "pdf")).toHaveLength(200);
  });
});

describe("EXIF dates", () => {
  it("reads DateTimeOriginal and OffsetTimeOriginal, little and big endian", () => {
    for (const little of [true, false]) {
      expect(readExifDates(exifBlock("2026:10:12 14:03:22", "+02:00", little))).toEqual({
        dateTimeOriginal: "2026:10:12 14:03:22",
        offsetTimeOriginal: "+02:00",
      });
    }
    expect(readExifDates(exifBlock("2026:10:12 14:03:22", null, true, false))).toEqual({
      dateTimeOriginal: "2026:10:12 14:03:22",
      offsetTimeOriginal: null,
    });
  });

  it("gives nulls for missing or broken EXIF instead of failing", () => {
    const none = { dateTimeOriginal: null, offsetTimeOriginal: null };
    expect(readExifDates(null)).toEqual(none);
    expect(readExifDates(exifBlock(null, null))).toEqual(none);
    expect(readExifDates(bytes("Exif", 0, 0, "garbage-garbage"))).toEqual(none);
    const truncated = exifBlock("2026:10:12 14:03:22", "+02:00").subarray(0, 40);
    expect(readExifDates(truncated).dateTimeOriginal).toBeNull();
  });

  it("turns the date into an instant, with its offset or in TZ", () => {
    const tz = "Europe/Paris";
    expect(
      exifInstant({ dateTimeOriginal: "2026:10:12 14:03:22", offsetTimeOriginal: "+02:00" }, tz),
    ).toBe(Date.UTC(2026, 9, 12, 12, 3, 22));
    expect(
      exifInstant({ dateTimeOriginal: "2026:10:12 14:03:22", offsetTimeOriginal: "-05:00" }, tz),
    ).toBe(Date.UTC(2026, 9, 12, 19, 3, 22));
    // No offset: read in TZ (winter time in January).
    expect(
      exifInstant({ dateTimeOriginal: "2026:01:15 09:00:00", offsetTimeOriginal: null }, tz),
    ).toBe(Date.UTC(2026, 0, 15, 8));
    for (const bad of ["0000:00:00 00:00:00", "2026:02:30 10:00:00", "2026:10:12 25:00:00", ""]) {
      expect(exifInstant({ dateTimeOriginal: bad, offsetTimeOriginal: null }, tz)).toBeNull();
    }
  });

  it("falls back to lastModified, then the upload time (H-11)", () => {
    const uploadedAt = Date.UTC(2026, 9, 27, 18);
    const base = { uploadedAt, timeZone: "Europe/Paris" };
    const exif = { dateTimeOriginal: "2026:10:12 14:03:22", offsetTimeOriginal: "+02:00" };
    const noExif = { dateTimeOriginal: null, offsetTimeOriginal: null };
    const modified = Date.UTC(2026, 9, 20, 9);
    expect(resolveTakenAt({ ...base, exif, lastModified: modified })).toBe(
      Date.UTC(2026, 9, 12, 12, 3, 22),
    );
    expect(resolveTakenAt({ ...base, exif: noExif, lastModified: modified })).toBe(modified);
    expect(resolveTakenAt({ ...base, exif: noExif, lastModified: null })).toBe(uploadedAt);
    // Not believed: in the future, or before 1990.
    expect(
      resolveTakenAt({ ...base, exif: noExif, lastModified: uploadedAt + 3 * 86_400_000 }),
    ).toBe(uploadedAt);
    expect(resolveTakenAt({ ...base, exif: noExif, lastModified: 0 })).toBe(uploadedAt);
  });
});

describe("cover rules (D-75)", () => {
  it("only takes a photo of the element itself", () => {
    expect(canBeCover({ kind: "photo", ownedByTarget: true })).toBe(true);
    expect(canBeCover({ kind: "photo", ownedByTarget: false })).toBe(false);
    expect(canBeCover({ kind: "invoice", ownedByTarget: true })).toBe(false);
  });

  it("makes the first photo the cover, and drops the cover when it stops being a photo", () => {
    expect(becomesCover("photo", null)).toBe(true);
    expect(becomesCover("photo", 4)).toBe(false);
    expect(becomesCover("invoice", null)).toBe(false);
    expect(keepsCover("photo")).toBe(true);
    expect(keepsCover("manual")).toBe(false);
  });
});
