/**
 * Theme choice (D-31, D-52): kept per device in a cookie. "system" follows the operating system
 * through the CSS `prefers-color-scheme` query; "light" and "dark" set data-theme on <html>.
 */
export const THEME_COOKIE = "theme";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "Thème du système",
  light: "Thème clair",
  dark: "Thème sombre",
};

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export function parseThemePreference(value: string | undefined | null): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";
}

/** The value of <html data-theme>, or undefined to let the system setting decide. */
export function themeAttribute(preference: ThemePreference): "light" | "dark" | undefined {
  return preference === "system" ? undefined : preference;
}

export function nextThemePreference(current: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(current);
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length];
}

/** Applies the choice right away and remembers it for the next server render (browser only). */
export function applyThemePreference(preference: ThemePreference): void {
  const attribute = themeAttribute(preference);
  if (attribute) document.documentElement.setAttribute("data-theme", attribute);
  else document.documentElement.removeAttribute("data-theme");
  document.cookie = `${THEME_COOKIE}=${preference}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; SameSite=Lax`;
}
