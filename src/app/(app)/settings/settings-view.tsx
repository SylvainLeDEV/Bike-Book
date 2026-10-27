"use client";

import { SettingsScreen } from "@/components/settings/settings-screen";
import { PageBody, Topbar } from "@/components/shell/topbar";

export function SettingsView({ version }: { version: string }) {
  return (
    <>
      <Topbar />
      <PageBody>
        <SettingsScreen exportHref="/api/export" version={version} />
      </PageBody>
    </>
  );
}
