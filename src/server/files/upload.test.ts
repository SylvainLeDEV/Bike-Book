import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createBike, getBike, listAttachments, type BikeData } from "@/server/db";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";
import { createTestContext } from "@/test/context";
import { generatedPdf, generatedPhoto, streamOf } from "./generated";
import { derivedFile } from "./images";
import { dataPath } from "./storage";
import { storeUpload, type UploadInput } from "./upload";

const NOW = Date.parse("2026-10-27T18:00:00Z");
const TZ = "Europe/Paris";

const bike: BikeData = {
  name: "Gravel alu",
  discipline: "gravel",
  isElectric: false,
  brand: null,
  model: null,
  modelYear: null,
  frameSize: null,
  wheelSize: null,
  color: null,
  frameSerial: null,
  weightG: null,
  purchasedOn: null,
  purchasePriceCents: null,
  purchaseShop: null,
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
  status: "active",
  statusChangedOn: null,
  salePriceCents: null,
  notes: null,
};

function setup(name: string) {
  const ctx = createTestContext(name);
  const created = createBike(ctx, bike);
  if (!created.ok) throw new Error("bike");
  return { ctx, owner: { kind: "bike" as const, id: created.bikeId } };
}

const upload = (
  ctx: Parameters<typeof storeUpload>[0],
  input: Partial<UploadInput> & Pick<UploadInput, "owner" | "body">,
) =>
  storeUpload(ctx, {
    name: null,
    lastModified: null,
    asCover: false,
    timeZone: TZ,
    now: NOW,
    ...input,
  });

/** Nothing is left in the temporary folder after an upload, whatever its outcome. */
const noPartialFiles = () => {
  const temp = dataPath("uploads/.tmp");
  return !existsSync(temp) || readdirSync(temp).length === 0;
};

describe("storeUpload", () => {
  it("keeps an iPhone-like photo byte for byte, dated from EXIF, with upright copies without metadata", async () => {
    const { ctx, owner } = setup("Camille");
    const original = await generatedPhoto({
      width: 300,
      height: 200,
      sky: "#7fb5c9",
      ground: "#4d6b3c",
      label: "Test",
      dateTimeOriginal: "2026:10:12 14:03:22",
      offsetTimeOriginal: "+02:00",
    });
    const outcome = await upload(ctx, {
      owner,
      body: streamOf(original, 1000),
      name: "IMG_0420.jpeg",
      lastModified: Date.parse("2026-10-20T10:00:00Z"),
    });
    if (!outcome.ok) throw new Error(outcome.code);
    const { attachment } = outcome;

    expect(attachment).toMatchObject({
      kind: "photo",
      mimeType: "image/jpeg",
      originalName: "IMG_0420.jpeg",
      sizeBytes: original.length,
      sha256: createHash("sha256").update(original).digest("hex"),
      widthPx: 300,
      heightPx: 200,
      takenAt: Date.UTC(2026, 9, 12, 12, 3, 22),
    });
    expect(attachment.storagePath).toMatch(/^uploads\/2026\/10\/[0-9a-f]{32}\.jpg$/);
    expect(readFileSync(dataPath(attachment.storagePath)).equals(original)).toBe(true);
    // The first photo of a bike becomes its cover (D-75).
    expect(getBike(ctx, owner.id)?.coverAttachmentId).toBe(attachment.id);

    for (const size of ["thumb", "display"] as const) {
      const copy = await sharp(await derivedFile(attachment.storagePath, size)).metadata();
      expect(copy.format).toBe("webp");
      expect(copy.width).toBeGreaterThan(copy.height); // Upright: orientation 6 applied.
      expect(copy.exif).toBeUndefined(); // No EXIF, so no GPS (D-72).
      expect(copy.orientation).toBeUndefined();
    }
    const original6 = await sharp(dataPath(attachment.storagePath)).metadata();
    expect(original6.orientation).toBe(6);
    expect(noPartialFiles()).toBe(true);
  });

  it("dates a photo without EXIF date from lastModified, else from the upload", async () => {
    const { ctx, owner } = setup("Lou");
    const photo = await generatedPhoto({
      width: 80,
      height: 60,
      sky: "#888888",
      ground: "#444444",
      label: "x",
    });
    const withModified = await upload(ctx, {
      owner,
      body: streamOf(photo),
      lastModified: Date.parse("2026-10-27T08:30:00Z"),
    });
    const without = await upload(ctx, { owner, body: streamOf(photo) });
    expect(withModified).toMatchObject({
      ok: true,
      attachment: { takenAt: Date.parse("2026-10-27T08:30:00Z") },
    });
    expect(without).toMatchObject({ ok: true, attachment: { takenAt: NOW } });
  });

  it("files a PDF as an invoice, without dimensions or date", async () => {
    const { ctx, owner } = setup("Sam");
    const pdf = generatedPdf("Facture", ["Ligne 1"]);
    const outcome = await upload(ctx, { owner, body: streamOf(pdf), name: "facture.pdf" });
    expect(outcome).toMatchObject({
      ok: true,
      attachment: { kind: "invoice", mimeType: "application/pdf", widthPx: null, takenAt: null },
    });
    expect(getBike(ctx, owner.id)?.coverAttachmentId).toBeNull();
  });

  it("refuses 25 MB + 1 byte while streaming, and keeps exactly 25 MB", async () => {
    const { ctx, owner } = setup("Big");
    const pdfHead = Buffer.from("%PDF-1.4\n");
    const over = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    over.set(pdfHead);
    expect(await upload(ctx, { owner, body: streamOf(over) })).toEqual({
      ok: false,
      code: "too_large",
    });
    const exact = over.subarray(0, MAX_UPLOAD_BYTES);
    expect(await upload(ctx, { owner, body: streamOf(exact) })).toMatchObject({ ok: true });
    expect(listAttachments(ctx, owner)).toHaveLength(1);
    expect(noPartialFiles()).toBe(true);
  });

  it("refuses a .jpg that is something else, an HEIC, and an image that does not decode", async () => {
    const { ctx, owner } = setup("Fake");
    const text = Buffer.from("Ceci n'est pas une photo, malgré son nom en .jpg");
    expect(await upload(ctx, { owner, body: streamOf(text), name: "photo.jpg" })).toEqual({
      ok: false,
      code: "unsupported",
    });
    const heic = new Uint8Array(200);
    heic.set([0, 0, 0, 24, ...Buffer.from("ftypheic"), 0, 0, 0, 0, ...Buffer.from("mif1heic")]);
    expect(await upload(ctx, { owner, body: streamOf(heic), name: "IMG_0001.HEIC" })).toEqual({
      ok: false,
      code: "heic",
    });
    const broken = new Uint8Array(500);
    broken.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(await upload(ctx, { owner, body: streamOf(broken), name: "abimee.jpg" })).toEqual({
      ok: false,
      code: "unreadable",
    });
    expect(listAttachments(ctx, owner)).toEqual([]);
    expect(readdirSync(dataPath("uploads/2026/10")).filter((f) => f.startsWith("x"))).toEqual([]);
    expect(noPartialFiles()).toBe(true);
  });

  it("checks the element before writing anything (D-25)", async () => {
    const { owner } = setup("Owner");
    const intruder = createTestContext("Intruder");
    const pdf = generatedPdf("Facture", []);
    expect(await upload(intruder, { owner, body: streamOf(pdf) })).toEqual({
      ok: false,
      code: "not_found",
    });
    expect(noPartialFiles()).toBe(true);
  });

  it("cleans up when the browser goes away mid-upload", async () => {
    const { ctx, owner } = setup("Abort");
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ === 0)
          controller.enqueue(
            new Uint8Array([...Buffer.from("%PDF-1.4\n"), ...new Uint8Array(100)]),
          );
        else controller.error(new Error("connection reset"));
      },
    });
    expect(await upload(ctx, { owner, body })).toEqual({ ok: false, code: "aborted" });
    expect(listAttachments(ctx, owner)).toEqual([]);
    expect(noPartialFiles()).toBe(true);
  });
});
