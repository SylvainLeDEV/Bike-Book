"use client";

import { SettingsScreen } from "@/components/settings/settings-screen";
import { PageBody, Topbar } from "@/components/shell/topbar";
import type { LocalDate } from "@/lib/format";
import type { ApiTokenVM, GarminSettingsVM } from "@/lib/view-models";
import { createApiTokenAction, revokeApiTokenAction } from "@/server/actions/api-tokens";
import {
  disconnectGarminAction,
  saveGarminKeyAction,
  setActivityTypeBikeAction,
  syncGarminNowAction,
} from "@/server/actions/garmin";

export function SettingsView({
  version,
  tokens,
  mcpUrl,
  today,
  garmin,
}: {
  version: string;
  garmin: GarminSettingsVM;
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
          garmin={{
            vm: garmin,
            onSaveKey: saveGarminKeyAction,
            onSync: syncGarminNowAction,
            onDisconnect: disconnectGarminAction,
            onSetTypeBike: setActivityTypeBikeAction,
          }}
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
