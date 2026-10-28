import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dataPath, derivedDir } from "@/server/files/storage";
import { createTestContext } from "@/test/context";
import { getDb } from "./client";
import {
  createAttachment,
  createBike,
  createComponent,
  deleteAttachment,
  deleteMaintenanceEvent,
  deleteRide,
  getAttachment,
  getBike,
  listAttachments,
  listBikeAttachments,
  listInventory,
  replaceComponent,
  setAttachmentCover,
  undoReplacement,
  updateAttachment,
  type AccessContext,
  type AttachmentData,
  type AttachmentOwner,
  type BikeData,
} from "./index";
import * as schema from "./schema";

const NOW = Date.parse("2026-10-25T10:00:00Z");

const bike: BikeData = {
  name: "Spectral",
  discipline: "enduro",
  isElectric: false,
  brand: null,
  model: null,
  modelYear: null,
  frameSize: null,
  wheelSize: null,
  color: null,
  frameSerial: null,
  weightG: null,
  purchasedOn: "2024-03-14",
  purchasePriceCents: null,
  purchaseShop: null,
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
  status: "active",
  statusChangedOn: "2024-03-14",
  salePriceCents: null,
  notes: null,
};

let counter = 0;

/** A row's data, with an original and a derived copy written to the test data directory. */
function file(kind: AttachmentData["kind"], mimeType = "image/jpeg"): AttachmentData {
  counter += 1;
  const ext = mimeType === "application/pdf" ? "pdf" : "jpg";
  const storagePath = `uploads/2026/10/${String(counter).padStart(32, "0")}.${ext}`;
  mkdirSync(path.dirname(dataPath(storagePath)), { recursive: true });
  writeFileSync(dataPath(storagePath), "original");
  mkdirSync(dataPath(derivedDir(storagePath)), { recursive: true });
  writeFileSync(dataPath(`${derivedDir(storagePath)}/thumb.webp`), "copy");
  return {
    kind,
    storagePath,
    originalName: `fichier-${counter}.${ext}`,
    mimeType,
    sizeBytes: 8,
    sha256: "0".repeat(64),
    widthPx: mimeType.startsWith("image/") ? 4032 : null,
    heightPx: mimeType.startsWith("image/") ? 3024 : null,
    takenAt: mimeType.startsWith("image/") ? NOW : null,
    caption: null,
  };
}

const onDisk = (storagePath: string) => ({
  original: existsSync(dataPath(storagePath)),
  copies: existsSync(dataPath(derivedDir(storagePath))),
});

function add(ctx: AccessContext, owner: AttachmentOwner, data: AttachmentData, asCover = false) {
  const outcome = createAttachment(ctx, owner, data, { asCover });
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.attachment;
}

/** A bike with one element of every kind, as rows (the flows creating them are tested elsewhere). */
function garage(name: string) {
  const ctx = createTestContext(name);
  const created = createBike(ctx, bike);
  if (!created.ok) throw new Error("bike");
  const bikeId = created.bikeId;
  const db = getDb();
  const part = createComponent(
    ctx,
    bikeId,
    { typeCode: "chain", position: "none" },
    {
      brand: "SRAM",
      model: "GX Eagle",
      reference: null,
      origin: "stock",
      installedAt: Date.parse("2024-03-13T23:00:00Z"),
      initialDistanceM: 0,
      initialWearS: 0,
      purchasedOn: null,
      purchasePriceCents: null,
      shop: null,
      warrantyEndsOn: null,
      notes: null,
    },
  );
  if (!part.ok) throw new Error(part.reason);
  const ride = db
    .insert(schema.rides)
    .values({ bikeId, startedAt: new Date(NOW), rideType: "trail", totalTimeS: 3600 })
    .returning()
    .get();
  const event = db
    .insert(schema.maintenanceEvents)
    .values({ bikeId, performedOn: "2026-10-24", title: "Purge des freins", performedBy: "self" })
    .returning()
    .get();
  const task = db
    .insert(schema.tasks)
    .values({ workspaceId: ctx.workspace.id, bikeId, title: "Pivots" })
    .returning()
    .get();
  const item = db
    .insert(schema.inventoryItems)
    .values({
      workspaceId: ctx.workspace.id,
      kind: "tool",
      name: "Clé dynamométrique",
      category: "other",
    })
    .returning()
    .get();
  const owners = {
    bike: { kind: "bike", id: bikeId },
    component: { kind: "component", id: part.componentId },
    maintenance_event: { kind: "maintenance_event", id: event.id },
    ride: { kind: "ride", id: ride.id },
    task: { kind: "task", id: task.id },
    inventory_item: { kind: "inventory_item", id: item.id },
  } satisfies Record<string, AttachmentOwner>;
  return { ctx, bikeId, owners };
}

describe("attachments of every element", () => {
  it("adds, lists, edits and deletes a photo and an invoice on each kind of element", () => {
    const { ctx, owners } = garage("Camille");
    for (const owner of Object.values(owners)) {
      const photo = add(ctx, owner, file("photo"));
      const invoice = add(ctx, owner, file("invoice", "application/pdf"));
      expect(photo.owner).toEqual(owner);
      expect(listAttachments(ctx, owner)?.map((a) => a.id)).toEqual([photo.id, invoice.id]);

      const edited = updateAttachment(ctx, invoice.id, { caption: "Notice", kind: "manual" });
      expect(edited).toMatchObject({ ok: true, attachment: { caption: "Notice", kind: "manual" } });
      expect(updateAttachment(ctx, photo.id, { takenAt: NOW - 86_400_000 })).toMatchObject({
        ok: true,
        attachment: { takenAt: NOW - 86_400_000 },
      });

      expect(deleteAttachment(ctx, photo.id)).toEqual({ ok: true });
      expect(onDisk(photo.storagePath)).toEqual({ original: false, copies: false });
      expect(getAttachment(ctx, photo.id)).toBeNull();
      expect(listAttachments(ctx, owner)?.map((a) => a.id)).toEqual([invoice.id]);
    }
  });

  it("never makes a PDF a photo, nor dates a PDF", () => {
    const { ctx, owners } = garage("Lou");
    const pdf = add(ctx, owners.ride, file("invoice", "application/pdf"));
    expect(updateAttachment(ctx, pdf.id, { kind: "photo" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(updateAttachment(ctx, pdf.id, { takenAt: NOW })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(createAttachment(ctx, owners.ride, file("photo", "application/pdf"))).toEqual({
      ok: false,
      reason: "invalid",
    });
    // A photographed receipt is an image that may be an invoice (D-74).
    const receipt = add(ctx, owners.ride, file("invoice"));
    expect(updateAttachment(ctx, receipt.id, { kind: "photo" })).toMatchObject({ ok: true });
  });

  it("refuses an element or an attachment of another workspace (D-25)", () => {
    const mine = garage("Alex");
    const theirs = garage("Sam");
    const photo = add(mine.ctx, mine.owners.bike, file("photo"));
    for (const owner of Object.values(mine.owners)) {
      expect(createAttachment(theirs.ctx, owner, file("photo"))).toEqual({
        ok: false,
        reason: "not_found",
      });
      expect(listAttachments(theirs.ctx, owner)).toBeNull();
    }
    expect(listBikeAttachments(theirs.ctx, mine.bikeId)).toBeNull();
    expect(getAttachment(theirs.ctx, photo.id)).toBeNull();
    expect(updateAttachment(theirs.ctx, photo.id, { caption: "x" })).toMatchObject({ ok: false });
    expect(setAttachmentCover(theirs.ctx, photo.id, true)).toMatchObject({ ok: false });
    expect(deleteAttachment(theirs.ctx, photo.id)).toMatchObject({ ok: false });
    expect(onDisk(photo.storagePath).original).toBe(true);
  });

  it("enforces exactly one element in the database too (D-45)", () => {
    const { owners } = garage("Check");
    const insert = (owner: Partial<typeof schema.attachments.$inferInsert>) =>
      getDb()
        .insert(schema.attachments)
        .values({ ...file("other", "application/pdf"), takenAt: null, ...owner })
        .run();
    expect(() => insert({})).toThrow(/CHECK constraint failed: attachments_owner_check/);
    expect(() => insert({ bikeId: owners.bike.id, rideId: owners.ride.id })).toThrow(
      /attachments_owner_check/,
    );
  });
});

describe("the bike page's gallery and documents", () => {
  it("gathers the bike's own attachments and those of its elements, not the workshop's", () => {
    const { ctx, bikeId, owners } = garage("Gallery");
    const ids = Object.entries(owners).map(([kind, owner]) => [
      kind,
      add(ctx, owner, file("photo")).id,
    ]);
    const listed = listBikeAttachments(ctx, bikeId)!.map((a) => a.id);
    const expected = ids.filter(([kind]) => kind !== "inventory_item").map(([, id]) => id);
    expect(listed).toEqual(expected);
  });
});

describe("covers (D-75)", () => {
  it("makes the first photo of a bike or item its cover, and only a photo of its own", () => {
    const { ctx, bikeId, owners } = garage("Cover");
    add(ctx, owners.bike, file("invoice", "application/pdf"));
    expect(getBike(ctx, bikeId)?.coverAttachmentId).toBeNull();
    const first = add(ctx, owners.bike, file("photo"));
    const second = add(ctx, owners.bike, file("photo"));
    expect(getBike(ctx, bikeId)?.coverAttachmentId).toBe(first.id);
    expect(setAttachmentCover(ctx, second.id, true)).toEqual({ ok: true });
    expect(getBike(ctx, bikeId)?.coverAttachmentId).toBe(second.id);

    const third = add(ctx, owners.bike, file("photo"), true);
    expect(getBike(ctx, bikeId)?.coverAttachmentId).toBe(third.id);

    const ridePhoto = add(ctx, owners.ride, file("photo"));
    expect(setAttachmentCover(ctx, ridePhoto.id, true)).toEqual({ ok: false, reason: "invalid" });

    const item = add(ctx, owners.inventory_item, file("photo"));
    expect(listInventory(ctx)[0].photoAttachmentId).toBe(item.id);
    expect(setAttachmentCover(ctx, item.id, false)).toEqual({ ok: true });
    expect(listInventory(ctx)[0].photoAttachmentId).toBeNull();
  });

  it("drops the cover when the photo is deleted or stops being a photo", () => {
    const { ctx, bikeId, owners } = garage("Drop");
    const photo = add(ctx, owners.bike, file("photo"));
    updateAttachment(ctx, photo.id, { kind: "other" });
    expect(getBike(ctx, bikeId)?.coverAttachmentId).toBeNull();

    const next = add(ctx, owners.bike, file("photo"));
    expect(getBike(ctx, bikeId)?.coverAttachmentId).toBe(next.id);
    deleteAttachment(ctx, next.id);
    expect(getBike(ctx, bikeId)?.coverAttachmentId).toBeNull();

    // Even when the row goes another way, the foreign key sets the cover back to null.
    const third = add(ctx, owners.bike, file("photo"));
    getDb().delete(schema.attachments).where(eq(schema.attachments.id, third.id)).run();
    expect(getBike(ctx, bikeId)?.coverAttachmentId).toBeNull();
  });
});

describe("files of elements deleted with their attachments", () => {
  it("deletes a ride's files with the ride", () => {
    const { ctx, owners } = garage("Ride");
    const photo = add(ctx, owners.ride, file("photo"));
    const kept = add(ctx, owners.bike, file("photo"));
    expect(deleteRide(ctx, owners.ride.id)).toEqual({ ok: true });
    expect(onDisk(photo.storagePath)).toEqual({ original: false, copies: false });
    expect(onDisk(kept.storagePath)).toEqual({ original: true, copies: true });
  });

  it("deletes an event's files, and those of the parts its replacements fitted", () => {
    const { ctx, bikeId, owners } = garage("Event");
    const invoice = add(ctx, owners.maintenance_event, file("invoice", "application/pdf"));
    expect(deleteMaintenanceEvent(ctx, owners.maintenance_event.id)).toEqual({ ok: true });
    expect(onDisk(invoice.storagePath).original).toBe(false);

    const replaced = replaceComponent(ctx, {
      removedComponentId: owners.component.id,
      on: "2026-10-20",
      recordedAt: NOW,
      at: Date.parse("2026-10-20T21:59:59.999Z"),
      reason: "worn",
      removalNote: null,
      newPart: { brand: "SRAM", model: "GX Eagle T-Type", priceCents: 4490 },
      eventTitle: "Chaîne remplacée",
    });
    if (!replaced.ok) throw new Error(replaced.reason);
    const newPart = add(ctx, { kind: "component", id: replaced.newComponentId }, file("photo"));
    const oldPart = add(ctx, owners.component, file("photo"));
    expect(undoReplacement(ctx, replaced.itemId)).toEqual({ ok: true });
    expect(onDisk(newPart.storagePath).original).toBe(false);
    expect(onDisk(oldPart.storagePath).original).toBe(true);
    expect(listBikeAttachments(ctx, bikeId)?.map((a) => a.id)).toEqual([oldPart.id]);
  });

  it("keeps the files when the delete is refused", () => {
    const { ctx, owners } = garage("Refused");
    const photo = add(ctx, owners.ride, file("photo"));
    const intruder = createTestContext("Intruder");
    expect(deleteRide(intruder, owners.ride.id)).toEqual({ ok: false, reason: "not_found" });
    expect(onDisk(photo.storagePath).original).toBe(true);
  });
});
