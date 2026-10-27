import type { Metadata } from "next";
import { requireAccessContext } from "@/server/auth/context";
import packageJson from "../../../../package.json";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Réglages · Bike-Book" };

export default async function SettingsPage() {
  // The shell already holds the account; this only keeps signed-out visitors out.
  await requireAccessContext();
  return <SettingsView version={packageJson.version} />;
}
