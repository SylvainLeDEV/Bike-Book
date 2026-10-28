import "server-only";
import fs from "node:fs";
import path from "node:path";
import { formatDate, localDateOf } from "@/lib/format";
import type { ExportTable } from "@/server/db";
import { getEnv } from "@/server/env";
import packageJson from "../../../package.json";
import { toCsv } from "./csv";
import { parseDataModel, type ColumnDoc } from "./data-model";
import { zip, type ZipEntry, type ZipTime } from "./zip";

/*
 * The export archive (feature 12, D-12, D-50): each table as CSV and JSON, the data dictionary
 * (dictionary.json, built from the schema and the notes of docs/03), docs/03 itself, then the
 * attachments' original files under uploads/, at their `storage_path` (feature 10, D-72).
 */

/** Traced into the standalone output (next.config.ts) and copied into the image (Dockerfile). */
export const DATA_MODEL_PATH = path.join(process.cwd(), "docs/03-data-model.md");

export const FORMAT_VERSION = 1;

/** The unit a column's name carries (D-50: names say what and in which unit). */
export function columnUnit(name: string): string | null {
  const units: [RegExp, string][] = [
    [/_cents$/, "euro cents"],
    [/_at$/, "instant, milliseconds since 1970-01-01 UTC"],
    [/_on$/, "calendar date YYYY-MM-DD, in the export's time zone"],
    [/_m$/, "metres"],
    [/_s$/, "seconds"],
    [/_g$/, "grams"],
    [/_days$/, "days"],
    [/_count$/, "count"],
    [/_ratio$/, "ratio (1 = 100 %)"],
    [/_bytes$/, "bytes"],
    [/_px$/, "pixels"],
  ];
  return units.find(([suffix]) => suffix.test(name))?.[1] ?? null;
}

export type ExportMeta = {
  exportedAt: number;
  timeZone: string;
  workspace: { id: number; name: string };
};

const csvPath = (table: string) => `csv/${table}.csv`;
const jsonPath = (table: string) => `json/${table}.json`;

export function buildDictionary(
  tables: ExportTable[],
  docs: Map<string, Map<string, ColumnDoc>>,
  meta: ExportMeta,
) {
  return {
    format: "bike-book-export",
    format_version: FORMAT_VERSION,
    app_version: packageJson.version,
    exported_at: new Date(meta.exportedAt).toISOString(),
    time_zone: meta.timeZone,
    workspace: meta.workspace,
    conventions: {
      units:
        "Distances in metres, durations in seconds, money in euro cents, masses in grams: integers. The unit is in the column name (_m, _s, _cents, _g).",
      instants: "Columns ending in _at: milliseconds since 1970-01-01 UTC.",
      dates: "Columns ending in _on: calendar dates YYYY-MM-DD, in the time zone above.",
      enums: "English text values; allowed_values lists them, data-model.md defines each one.",
      csv: "RFC 4180, UTF-8, comma-separated, CRLF line ends. An empty cell is null; the JSON files keep the difference with an empty text.",
      derived:
        "Not stored, so not exported: stock quantities (sum of inventory_movements), wear counters (rides), rule status and total cost. Recompute them from the rows.",
      excluded: "Accounts, sessions and passwords are never exported.",
    },
    tables: tables.map((table) => {
      const notes = docs.get(table.name);
      return {
        name: table.name,
        files: { csv: csvPath(table.name), json: jsonPath(table.name) },
        row_count: table.rows.length,
        columns: table.columns.map((column) => ({
          name: column.name,
          type: column.type,
          format: column.format,
          unit: columnUnit(column.name),
          nullable: column.nullable,
          primary_key: column.primaryKey,
          references: column.references,
          allowed_values: column.allowedValues,
          doc_type: notes?.get(column.name)?.type ?? null,
          notes: notes?.get(column.name)?.notes || null,
        })),
      };
    }),
  };
}

/** The wall-clock time of an instant in a time zone, for the ZIP entries. */
function wallClock(epochMs: number, timeZone: string): ZipTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epochMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function readme(meta: ExportMeta, hasDataModel: boolean) {
  const time = wallClock(meta.exportedAt, meta.timeZone);
  const clock = `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
  const day = formatDate(localDateOf(meta.exportedAt, meta.timeZone));
  return [
    `Export Bike-Book — ${meta.workspace.name}`,
    `Exporté le ${day} à ${clock} (${meta.timeZone}), version ${packageJson.version}.`,
    "",
    "Contenu",
    "- csv/ : une table par fichier, pour un tableur (UTF-8, séparateur virgule).",
    "- json/ : les mêmes données avec leurs types (nombres, true/false, null).",
    "- dictionary.json : chaque table et chaque colonne, avec son type, son unité, ses valeurs permises et son sens.",
    "- uploads/ : les photos et documents joints, tels qu'ils ont été envoyés. La table attachments relie",
    "  chaque fichier (colonne storage_path) à son vélo, composant, entretien, sortie, tâche ou objet de l'atelier.",
    "  Ce sont les originaux : une photo garde ses informations d'appareil, position GPS comprise si le",
    "  téléphone l'a enregistrée. Ne partage pas l'export sans y penser.",
    ...(hasDataModel ? ["- data-model.md : le modèle de données complet (en anglais)."] : []),
    "",
    "Unités",
    "- distances en mètres (_m), durées en secondes (_s), montants en centimes d'euro (_cents), masses en grammes (_g) ;",
    "- instants (_at) en millisecondes depuis le 1er janvier 1970 UTC ; dates (_on) au format AAAA-MM-JJ.",
    "",
    "Le stock, l'usure, l'état des règles et le coût total ne sont pas enregistrés : ils se recalculent",
    "à partir des mouvements de stock, des sorties et des entretiens.",
    "Les comptes, mots de passe et sessions ne sont jamais exportés.",
    "",
    "Ouvrir un CSV dans Excel : Données > À partir d'un fichier texte/CSV, origine UTF-8, délimiteur virgule.",
    "",
  ].join("\r\n");
}

/** The files of the archive, in order. `dataModel` is docs/03, or null if it could not be read. */
export function exportEntries(
  tables: ExportTable[],
  dataModel: string | null,
  meta: ExportMeta,
): ZipEntry[] {
  const encode = (text: string) => new TextEncoder().encode(text);
  const docs = dataModel ? parseDataModel(dataModel) : new Map<string, Map<string, ColumnDoc>>();
  const entries: ZipEntry[] = [
    { name: "LISEZMOI.txt", data: encode(readme(meta, dataModel != null)) },
    {
      name: "dictionary.json",
      data: encode(JSON.stringify(buildDictionary(tables, docs, meta), null, 2) + "\n"),
    },
  ];
  if (dataModel) entries.push({ name: "data-model.md", data: encode(dataModel) });
  for (const table of tables) {
    const header = table.columns.map((column) => column.name);
    entries.push({ name: csvPath(table.name), data: encode(toCsv(header, table.rows)) });
    const objects = table.rows.map((row) =>
      Object.fromEntries(header.map((name, i) => [name, row[i]])),
    );
    entries.push({
      name: jsonPath(table.name),
      data: encode(JSON.stringify(objects, null, 2) + "\n"),
    });
  }
  return entries;
}

/** An attachment's original, as the export copies it. */
export type ExportFile = { storagePath: string; sizeBytes: number; mimeType: string };

/**
 * The attachments' originals, read one at a time (25 MB at most each) while the archive
 * streams. A file missing on disk is listed in `fichiers-manquants.txt` instead of failing the
 * export. Images are stored as they are: compressing a JPEG again gains nothing.
 */
export async function* fileEntries(
  files: ExportFile[],
  read: (storagePath: string) => Promise<Uint8Array> = (p) =>
    fs.promises.readFile(path.resolve(getEnv().dataDir, p)),
): AsyncGenerator<ZipEntry> {
  const missing: string[] = [];
  for (const file of files) {
    try {
      const data = await read(file.storagePath);
      yield { name: file.storagePath, data, compress: !file.mimeType.startsWith("image/") };
    } catch {
      missing.push(file.storagePath);
    }
  }
  if (missing.length) {
    const text = [
      "Ces fichiers sont dans la table attachments mais n'ont pas été trouvés sur le disque :",
      ...missing,
      "",
    ].join("\r\n");
    yield { name: "fichiers-manquants.txt", data: new TextEncoder().encode(text) };
  }
}

/** ZIP without ZIP64 (zip.ts): what the archive can hold, with room for headers. */
export const MAX_ARCHIVE_BYTES = 0xffff_ffff - 16 * 1024 * 1024;

/**
 * An upper bound of the archive's size, checked before the first byte: past 4 GiB the export
 * is refused with a clear message instead of a download that breaks halfway.
 */
export function estimatedArchiveBytes(entries: ZipEntry[], files: ExportFile[]): number {
  const perEntry = 30 + 46 + 200; // local and central headers, a long name
  return (
    entries.reduce((sum, entry) => sum + entry.data.length + perEntry, 0) +
    files.reduce((sum, file) => sum + file.sizeBytes + perEntry, 0)
  );
}

/** The table entries, then the files: one stream, consumed lazily by the ZIP writer. */
export async function* archiveEntries(
  entries: ZipEntry[],
  files: AsyncIterable<ZipEntry>,
): AsyncGenerator<ZipEntry> {
  yield* entries;
  yield* files;
}

export function readDataModel(): string | null {
  try {
    return fs.readFileSync(DATA_MODEL_PATH, "utf8");
  } catch (error) {
    // The export still works without it; the notes and data-model.md are then missing.
    console.error("Export: data dictionary not found at", DATA_MODEL_PATH, error);
    return null;
  }
}

/** "bike-book-2026-10-26.zip": the day of the export in the configured time zone. */
export function exportFileName(meta: ExportMeta) {
  return `bike-book-${localDateOf(meta.exportedAt, meta.timeZone)}.zip`;
}

/** The archive as a byte stream, for the Route Handler. */
export function exportStream(
  entries: Iterable<ZipEntry> | AsyncIterable<ZipEntry>,
  meta: ExportMeta,
): ReadableStream<Uint8Array> {
  const chunks = zip(entries, wallClock(meta.exportedAt, meta.timeZone));
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await chunks.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}
