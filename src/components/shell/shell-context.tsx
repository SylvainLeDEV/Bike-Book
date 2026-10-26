"use client";

import * as React from "react";
import type { ThemePreference } from "@/lib/theme";
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

const ShellContext = React.createContext<ShellValue | null>(null);

export function ShellProvider({
  value,
  children,
}: {
  value: ShellValue;
  children: React.ReactNode;
}) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellValue {
  const value = React.useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside <ShellProvider>");
  return value;
}
