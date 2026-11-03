import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as upload } from "@/app/api/uploads/route";
import { issueToken } from "@/server/auth/tokens";
import { createUploadLink, UPLOAD_LINK_TTL_MS } from "@/server/auth/upload-links";
import {
  createBike,
  findTokenAccessById,
  listAttachments,
  revokeApiToken,
  type AccessContext,
  type BikeData,
} from "@/server/db";
import { generatedPdf, generatedPhoto } from "@/server/files/generated";
import { createTestContext } from "@/test/context";
import { callTool } from "@/test/mcp";

// Upload links and the attachment tools (D-99): a file sent with the link the MCP answers, through
// the real upload route and without a session; the link's limits (element, expiry, signature,
// token revoked); then list, caption, cover, delete.

// No browser session in these tests: only the link authenticates.
vi.mock("@/server/auth/context", () => ({ getAccessContext: async () => null }));

function garage(name: string): { ctx: AccessContext; token: string; tokenId: number } {
  const ctx = createTestContext(name);
  const issued = issueToken(ctx, "Tests");
  return { ctx, token: issued.token, tokenId: issued.tokenId };
}

const BIKE: BikeData = {
  name: "Gravel",
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
  purchasedOn: "2021-05-02",
  purchasePriceCents: null,
  purchaseShop: null,
  boughtUsed: false,
  initialDistanceM: 0,
  initialWearS: 0,
  status: "active",
  statusChangedOn: "2021-05-02",
  salePriceCents: null,
  notes: null,
};

function addBike(ctx: AccessContext, name = BIKE.name): number {
  const outcome = createBike(ctx, { ...BIKE, name });
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.bikeId;
}

const photo = () =>
  generatedPhoto({ width: 64, height: 48, sky: "#88aacc", ground: "#556b2f", label: "Test" });

/** Sends a file as Claude Code would: curl --data-binary @file -H "X-Upload-Link: …" "<url>". */
async function send(target: { url: string; link: string }, bytes: Uint8Array, name: string) {
  const response = await upload(
    new Request(target.url, {
      method: "POST",
      headers: {
        "x-upload-link": target.link,
        "x-file-name": encodeURIComponent(name),
        "content-length": String(bytes.length),
      },
      body: new Uint8Array(bytes).buffer,
    }),
  );
  return { status: response.status, body: await response.json() };
}

afterEach(() => vi.restoreAllMocks());

describe("get_upload_link and the upload route", () => {
  it("sends a photo and a PDF to a workshop item without a session; the photo becomes its photo", async () => {
    const { ctx, token } = garage("Upload");
    const added = await callTool(token, "add_workshop_item", {
      kind: "tool",
      name: "Clé dynamométrique",
      category: "other",
      dry_run: false,
    });
    const itemId = added.structuredContent.item.id as number;

    const link = await callTool(token, "get_upload_link", {
      owner_kind: "inventory_item",
      owner_id: itemId,
      as_cover: true,
    });
    const target = {
      url: link.structuredContent.url as string,
      link: link.structuredContent.headers["X-Upload-Link"] as string,
    };
    // The link travels in a header, never in the URL that access logs keep.
    expect(target.url).toMatch(/\/api\/uploads\?owner=inventory_item&id=\d+&cover=1$/);

    const lines: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line: string) => void lines.push(line));
    const sentPhoto = await send(target, await photo(), "clé.jpg");
    expect(sentPhoto.status).toBe(201);
    const sentPdf = await send(
      target,
      generatedPdf("Notice", ["Couples de serrage"]),
      "notice.pdf",
    );
    expect(sentPdf.status).toBe(201);
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      expect.objectContaining({ event: "mcp_upload", attachment_id: sentPhoto.body.id }),
      expect.objectContaining({ event: "mcp_upload", attachment_id: sentPdf.body.id }),
    ]);

    const listed = await callTool(token, "list_attachments", {
      owner_kind: "inventory_item",
      owner_id: itemId,
    });
    expect(listed.structuredContent.attachments).toEqual([
      expect.objectContaining({
        id: sentPhoto.body.id,
        kind: "photo",
        name: "clé.jpg",
        is_cover: true,
      }),
      expect.objectContaining({ id: sentPdf.body.id, is_image: false, name: "notice.pdf" }),
    ]);
    const item = await callTool(token, "list_workshop_items", {});
    expect(item.structuredContent.items[0].name).toBe("Clé dynamométrique");
    expect(listAttachments(ctx, { kind: "inventory_item", id: itemId })).toHaveLength(2);
  });

  it("a link works for its element only, until it expires, while its token is active", async () => {
    const { ctx, tokenId } = garage("Limits");
    const bikeId = addBike(ctx);
    const other = addBike(ctx, "Route");
    const tokenCtx = findTokenAccessById(tokenId)!;
    const target = createUploadLink(tokenCtx, { kind: "bike", id: bikeId });
    const bytes = await photo();

    // A link that does not authenticate answers link_invalid, not signed_out (D-100).
    const linkInvalid = {
      status: 401,
      body: {
        error: "link_invalid",
        message:
          "Ce lien d'envoi n'est pas valable pour cet élément ou a expiré : demandes-en un nouveau.",
      },
    };
    // Another element with the same link.
    const moved = { ...target, url: target.url.replace(`id=${bikeId}`, `id=${other}`) };
    expect(await send(moved, bytes, "a.jpg")).toEqual(linkInvalid);
    // A tampered signature.
    expect(
      await send({ ...target, link: `${target.link.slice(0, -2)}xx` }, bytes, "a.jpg"),
    ).toEqual(linkInvalid);
    // No link and no session: signed out.
    expect(await send({ ...target, link: "" }, bytes, "a.jpg")).toMatchObject({
      status: 401,
      body: { error: "signed_out" },
    });
    // Expired.
    const old = createUploadLink(
      tokenCtx,
      { kind: "bike", id: bikeId },
      {
        now: Date.now() - UPLOAD_LINK_TTL_MS - 1,
      },
    );
    expect(await send(old, bytes, "a.jpg")).toEqual(linkInvalid);
    // HEIC or anything not a photo or a PDF is refused, as in the browser.
    const text = await send(target, new TextEncoder().encode("not a photo"), "a.txt");
    expect(text).toMatchObject({ status: 415, body: { error: "unsupported" } });
    // Valid, then revoked.
    expect((await send(target, bytes, "a.jpg")).status).toBe(201);
    revokeApiToken(ctx, tokenId);
    expect(await send(target, bytes, "b.jpg")).toEqual(linkInvalid);
    expect(listAttachments(ctx, { kind: "bike", id: bikeId })).toHaveLength(1);
  });

  it("refuses a link for another workspace's element, or a cover where there is none", async () => {
    const a = garage("Alice");
    const b = garage("Bob");
    const bobBike = addBike(b.ctx);
    const theirs = await callTool(a.token, "get_upload_link", {
      owner_kind: "bike",
      owner_id: bobBike,
    });
    expect(theirs.structuredContent.errors).toEqual([
      { field: "owner_id", message: "Cet élément n'existe plus." },
    ]);
    const ride = await callTool(b.token, "create_ride", {
      bike_id: bobBike,
      on: "2026-11-01",
      ride_type: "gravel",
      duration_s: 3600,
      dry_run: false,
    });
    const cover = await callTool(b.token, "get_upload_link", {
      owner_kind: "ride",
      owner_id: ride.structuredContent.ride.id,
      as_cover: true,
    });
    expect(cover.structuredContent.errors[0]).toMatchObject({ field: "as_cover" });
  });
});

describe("update_attachment and delete_attachment", () => {
  it("captions, kinds and covers; deleting removes it, a dry run keeps it", async () => {
    const { ctx, token, tokenId } = garage("Edit");
    const bikeId = addBike(ctx);
    const target = createUploadLink(findTokenAccessById(tokenId)!, { kind: "bike", id: bikeId });
    const sentPhoto = (await send(target, await photo(), "velo.jpg")).body.id as number;
    const sentPdf = (await send(target, generatedPdf("Facture", ["Achat"]), "facture.pdf")).body
      .id as number;

    const captioned = await callTool(token, "update_attachment", {
      attachment_id: sentPhoto,
      caption: "Au col",
      is_cover: true,
      dry_run: false,
    });
    expect(captioned.structuredContent.attachment).toMatchObject({
      caption: "Au col",
      is_cover: true,
    });
    const pdfAsPhoto = await callTool(token, "update_attachment", {
      attachment_id: sentPdf,
      kind: "photo",
      dry_run: false,
    });
    expect(pdfAsPhoto.structuredContent.errors).toEqual([
      { field: "kind", message: "Un PDF ne peut pas être une photo." },
    ]);
    const invoice = await callTool(token, "update_attachment", {
      attachment_id: sentPdf,
      kind: "invoice",
      dry_run: false,
    });
    expect(invoice.structuredContent.attachment.kind).toBe("invoice");

    const pdfPreview = await callTool(token, "delete_attachment", {
      attachment_id: sentPdf,
      dry_run: true,
    });
    expect(pdfPreview.structuredContent.warnings).toEqual([]);
    expect(listAttachments(ctx, { kind: "bike", id: bikeId })).toHaveLength(2);
    // The bike's photo: the dry run warns that it will have none (D-100).
    const coverPreview = await callTool(token, "delete_attachment", {
      attachment_id: sentPhoto,
      dry_run: true,
    });
    expect(coverPreview.structuredContent.warnings).toEqual([
      "This photo is the bike's photo: it would have none (update_attachment is_cover true makes another photo its photo).",
    ]);
    await callTool(token, "delete_attachment", { attachment_id: sentPdf, dry_run: false });
    expect(listAttachments(ctx, { kind: "bike", id: bikeId })?.map((a) => a.id)).toEqual([
      sentPhoto,
    ]);

    const other = garage("Other");
    const theirs = await callTool(other.token, "delete_attachment", {
      attachment_id: sentPhoto,
      dry_run: false,
    });
    expect(theirs.structuredContent.errors[0]).toMatchObject({ field: "attachment_id" });
  });
});
