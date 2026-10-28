import "server-only";
import { addDays, type LocalDate } from "@/lib/format";
import {
  generatedPdf,
  generatedPhoto,
  streamOf,
  type GeneratedPhoto,
} from "@/server/files/generated";
import { storeUpload } from "@/server/files/upload";
import type { AccessContext } from "./access-context";
import { updateAttachment, type AttachmentOwner } from "./attachments";
import { listComponents, listMaintenanceEvents } from "./components";
import { listInventory } from "./inventory";
import { listRides } from "./rides";
import { listOpenTasks } from "./tasks";

// Demo attachments (feature 10, D-22): generated pictures and PDFs, never real ones. They go
// through the same upload path as the browser's files, so the demo has thumbnails, covers,
// EXIF dates and iPhone-like orientation to check.

type DemoFile = {
  owner: AttachmentOwner | null;
  name: string;
  caption?: string;
  kind?: "manual" | "other";
  asCover?: boolean;
  lastModified?: number;
} & (
  { photo: Omit<GeneratedPhoto, "width" | "height"> } | { pdf: { title: string; lines: string[] } }
);

/** "2026:10:12 10:30:00", in TZ (no offset written, so read in TZ like many cameras). */
const exifDate = (date: LocalDate, time = "10:30:00") => `${date.replaceAll("-", ":")} ${time}`;

export async function seedDemoAttachments(input: {
  ctx: AccessContext;
  bikes: Map<string, { id: number; purchasedOn: LocalDate }>;
  day: (date: LocalDate) => LocalDate;
  timeZone: string;
}): Promise<void> {
  const { ctx, bikes, day, timeZone } = input;
  const spectral = bikes.get("Spectral");
  const lourd = bikes.get("Le Lourd");
  if (!spectral || !lourd) return;

  const rides = listRides(ctx, { bikeId: spectral.id });
  const lesGets = rides.find((ride) => ride.location === "Les Gets");
  const event = listMaintenanceEvents(ctx, spectral.id).find((e) => e.title.startsWith("Chaîne"));
  const shock = listComponents(ctx, spectral.id).find(
    (part) => part.typeCode === "rear_shock" && part.removedAt == null,
  );
  const task = listOpenTasks(ctx, spectral.id)[0];
  const item = listInventory(ctx)[0];

  const files: DemoFile[] = [
    {
      owner: { kind: "bike", id: spectral.id },
      name: "IMG_0412.jpeg",
      caption: "Premier tour, au retour du Salève",
      asCover: true,
      photo: {
        sky: "#8fb8d8",
        ground: "#4f6b46",
        label: "Spectral",
        dateTimeOriginal: exifDate(addDays(spectral.purchasedOn, 19), "18:12:40"),
      },
    },
    {
      owner: { kind: "bike", id: spectral.id },
      name: "IMG_0398.jpeg",
      caption: "Numéro de cadre, sous le boîtier de pédalier",
      photo: {
        sky: "#3a4150",
        ground: "#262b35",
        label: "N° de cadre",
        dateTimeOriginal: exifDate(spectral.purchasedOn, "15:02:11"),
      },
    },
    {
      owner: { kind: "bike", id: spectral.id },
      name: "Facture d'achat.pdf",
      pdf: {
        title: "Facture (exemple fictif)",
        lines: ["Rayon Libre, boutique fictive", "Canyon Spectral 29 CF", "Total : 4 299,00 EUR"],
      },
    },
    ...(event
      ? [
          {
            owner: { kind: "maintenance_event" as const, id: event.id },
            name: "IMG_0533.jpeg",
            caption: "Usure de la chaîne au calibre",
            photo: {
              sky: "#7a7f86",
              ground: "#3c4048",
              label: "Chaîne",
              dateTimeOriginal: exifDate(event.performedOn, "17:40:05"),
            },
          },
          {
            owner: { kind: "maintenance_event" as const, id: event.id },
            name: "facture.pdf",
            pdf: {
              title: "Facture (exemple fictif)",
              lines: ["Chaîne SRAM GX Eagle", "Plaquettes avant", "Total : 68,90 EUR"],
            },
          },
        ]
      : []),
    ...(lesGets
      ? [
          {
            owner: { kind: "ride" as const, id: lesGets.id },
            name: "IMG_0470.jpeg",
            caption: "Dernière descente de la journée",
            photo: {
              sky: "#9cc3e0",
              ground: "#7a6a4f",
              label: "Bike park",
              dateTimeOriginal: exifDate(day("2026-09-12"), "16:20:00"),
            },
          },
          {
            owner: { kind: "ride" as const, id: lesGets.id },
            name: "Forfait bike park.pdf",
            pdf: { title: "Forfait journée (exemple fictif)", lines: ["Total : 39,00 EUR"] },
          },
        ]
      : []),
    ...(shock
      ? [
          {
            owner: { kind: "component" as const, id: shock.id },
            name: "Notice amortisseur.pdf",
            kind: "manual" as const,
            pdf: {
              title: "Notice (exemple fictif)",
              lines: ["Pression conseillée : voir le tableau"],
            },
          },
        ]
      : []),
    ...(task
      ? [
          {
            owner: { kind: "task" as const, id: task.id },
            name: "image.jpg",
            caption: "Jeu au pivot inférieur",
            // Taken from the picker's camera: no EXIF date, only the file's date (H-11).
            lastModified: Date.parse(`${day("2026-10-24")}T08:15:00Z`),
            photo: { sky: "#5d6470", ground: "#2f343c", label: "Pivot" },
          },
        ]
      : []),
    ...(item
      ? [
          {
            owner: { kind: "inventory_item" as const, id: item.id },
            name: "IMG_0601.jpeg",
            photo: { sky: "#d9d4c7", ground: "#8c8577", label: item.name.slice(0, 18) },
          },
        ]
      : []),
    {
      owner: { kind: "bike", id: lourd.id },
      name: "image.jpg",
      photo: { sky: "#a7c4b5", ground: "#56614a", label: "Le Lourd" },
    },
  ];

  for (const file of files) {
    if (!file.owner) continue;
    const bytes =
      "photo" in file
        ? await generatedPhoto({ ...file.photo, width: 1200, height: 900 })
        : generatedPdf(file.pdf.title, file.pdf.lines);
    const outcome = await storeUpload(ctx, {
      owner: file.owner,
      body: streamOf(bytes),
      name: file.name,
      lastModified: file.lastModified ?? null,
      asCover: file.asCover ?? false,
      timeZone,
    });
    if (!outcome.ok) throw new Error(`Demo file ${file.name}: ${outcome.code}`);
    if (file.caption || file.kind) {
      updateAttachment(ctx, outcome.attachment.id, {
        caption: file.caption ?? null,
        ...(file.kind ? { kind: file.kind } : {}),
      });
    }
  }
}
