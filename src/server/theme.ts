import "server-only";
import { cookies } from "next/headers";
import { parseThemePreference, THEME_COOKIE, type ThemePreference } from "@/lib/theme";

/** The theme chosen on this device (D-52). Reading the cookie makes the route dynamic. */
export async function getThemePreference(): Promise<ThemePreference> {
  const store = await cookies();
  return parseThemePreference(store.get(THEME_COOKIE)?.value);
}
