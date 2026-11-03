import "server-only";
import { localDateOf, localTimeOf, type LocalDate } from "@/lib/format";
import type { ApiTokenVM } from "@/lib/view-models";
import { listApiTokens, type AccessContext } from "@/server/db";
import { getEnv } from "@/server/env";
import { today } from "@/server/time";

/** What "Paramètres" shows of the personal tokens (D-90), and the MCP endpoint they open. */
export function apiTokensView(ctx: AccessContext): {
  tokens: ApiTokenVM[];
  mcpUrl: string;
  today: LocalDate;
} {
  const { timeZone, publicUrl } = getEnv();
  return {
    tokens: listApiTokens(ctx).map((token) => ({
      id: token.id,
      name: token.name,
      tokenStart: token.tokenStart,
      createdOn: localDateOf(token.createdAt.getTime(), timeZone),
      lastUsed: token.lastUsedAt
        ? {
            on: localDateOf(token.lastUsedAt.getTime(), timeZone),
            time: localTimeOf(token.lastUsedAt.getTime(), timeZone),
          }
        : null,
    })),
    mcpUrl: `${publicUrl}/api/mcp`,
    today: today(),
  };
}
