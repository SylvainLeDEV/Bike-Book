"use client";

import { SettingsScreen } from "@/components/settings/settings-screen";
import { PageBody, Topbar } from "@/components/shell/topbar";
import type { LocalDate } from "@/lib/format";
import type { ApiTokenVM } from "@/lib/view-models";
import { createApiTokenAction, revokeApiTokenAction } from "@/server/actions/api-tokens";

export function SettingsView({
  version,
  tokens,
  mcpUrl,
  today,
}: {
  version: string;
  tokens: ApiTokenVM[];
  mcpUrl: string;
  today: LocalDate;
}) {
  return (
    <>
      <Topbar />
      <PageBody>
        <SettingsScreen
          exportHref="/api/export"
          version={version}
          tokens={{
            tokens,
            mcpUrl,
            today,
            onCreate: (name) => createApiTokenAction({ name }),
            onRevoke: async (tokenId) => {
              const result = await revokeApiTokenAction(tokenId);
              return result.ok ? null : result.error;
            },
          }}
        />
      </PageBody>
    </>
  );
}
