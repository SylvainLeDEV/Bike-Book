import { getAccessContext } from "@/server/auth/context";
import { exportWorkspaceTables } from "@/server/db";
import {
  exportEntries,
  exportFileName,
  exportStream,
  readDataModel,
  type ExportMeta,
} from "@/server/export/archive";
import { getEnv } from "@/server/env";

/**
 * "Exporter mes données" (feature 12, D-12): the current workspace as one ZIP. The tables are
 * read in one transaction before the first byte, so a failure is still a clean 500.
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
  const entries = exportEntries(exportWorkspaceTables(ctx), readDataModel(), meta);
  return new Response(exportStream(entries, meta), {
    headers: {
      ...headers,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${exportFileName(meta)}"`,
    },
  });
}
