import { getAccessContext } from "@/server/auth/context";
import { exportWorkspaceTables } from "@/server/db";
import {
  archiveEntries,
  estimatedArchiveBytes,
  exportEntries,
  exportFileName,
  exportStream,
  fileEntries,
  MAX_ARCHIVE_BYTES,
  readDataModel,
  type ExportMeta,
} from "@/server/export/archive";
import { getEnv } from "@/server/env";

/**
 * "Exporter mes données" (feature 12, D-12): the current workspace as one ZIP, its attachments'
 * files included (feature 10). The tables are read in one transaction before the first byte, so
 * a failure is still a clean 500; the files are read one by one while the archive streams.
 */
export async function GET() {
  const ctx = await getAccessContext();
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!ctx) return new Response("Connexion requise.", { status: 401, headers });

  const meta: ExportMeta = {
    exportedAt: Date.now(),
    timeZone: getEnv().timeZone,
    workspace: ctx.workspace,
  };
  const tables = exportWorkspaceTables(ctx);
  const entries = exportEntries(tables, readDataModel(), meta);
  const files = exportedFiles(tables);
  if (estimatedArchiveBytes(entries, files) > MAX_ARCHIVE_BYTES) {
    return new Response(
      "L'export dépasse 4 Go, la limite de ce format ZIP. Sauvegarde le dossier de données à la place (voir la documentation).",
      { status: 413, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(exportStream(archiveEntries(entries, fileEntries(files)), meta), {
    headers: {
      ...headers,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${exportFileName(meta)}"`,
    },
  });
}

/** The originals to copy, from the exported `attachments` rows (the workspace's only). */
function exportedFiles(tables: ReturnType<typeof exportWorkspaceTables>) {
  const table = tables.find((t) => t.name === "attachments");
  if (!table) return [];
  const column = (name: string) => table.columns.findIndex((c) => c.name === name);
  const [pathAt, sizeAt, mimeAt] = [
    column("storage_path"),
    column("size_bytes"),
    column("mime_type"),
  ];
  return table.rows.map((row) => ({
    storagePath: String(row[pathAt]),
    sizeBytes: Number(row[sizeAt]),
    mimeType: String(row[mimeAt]),
  }));
}
