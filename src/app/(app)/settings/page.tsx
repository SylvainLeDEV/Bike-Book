import type { Metadata } from "next";
import { requireAccessContext } from "@/server/auth/context";
import { apiTokensView } from "@/server/views/api-tokens";
import { garminSettingsView } from "@/server/views/garmin";
import packageJson from "../../../../package.json";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Paramètres · Bike-Book" };

export default async function SettingsPage() {
  // The shell already holds the account; the page adds the personal tokens (D-90) and the
  // Garmin import (D-101).
  const ctx = await requireAccessContext();
  return (
    <SettingsView
      version={packageJson.version}
      garmin={garminSettingsView(ctx)}
      {...apiTokensView(ctx)}
    />
  );
}
