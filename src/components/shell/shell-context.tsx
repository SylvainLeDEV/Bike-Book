"use client";

import * as React from "react";
import { applyThemePreference, type ThemePreference } from "@/lib/theme";
import type { ShellUserVM } from "@/lib/view-models";

/** Where the navigation entries lead: the real routes, or the /design screens. */
export type ShellNav = {
  home: string;
  bikes: string;
  activity: string;
  workshop: string;
};

export type ShellValue = {
  user: ShellUserVM;
  nav: ShellNav;
  theme: ThemePreference;
  /** Server Action in the app; a toast on /design. */
  onSignOut: () => void | Promise<void>;
  onOpenSettings: () => void;
};

/** The shell as pages see it: `theme` is the current choice, `setTheme` changes it. */
type ShellContextValue = ShellValue & { setTheme: (theme: ThemePreference) => void };

const ShellContext = React.createContext<ShellContextValue | null>(null);

export function ShellProvider({
  value,
  children,
}: {
  value: ShellValue;
  children: React.ReactNode;
}) {
  // One theme state for the top bar toggle and the settings page.
  const [theme, setTheme] = React.useState(value.theme);
  const context: ShellContextValue = {
    ...value,
    theme,
    setTheme: (next) => {
      applyThemePreference(next);
      setTheme(next);
    },
  };
  return <ShellContext.Provider value={context}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const value = React.useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside <ShellProvider>");
  return value;
}
