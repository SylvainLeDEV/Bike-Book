import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToastProvider } from "@/components/ui/toast";
import { getThemePreference } from "@/server/theme";
import { DesignShell } from "./design-shell";

export const metadata: Metadata = {
  title: "Design · Bike-Book",
  robots: { index: false, follow: false },
};

/**
 * Development-only design system (D-32): the mockup's screens rebuilt with the app's real
 * components and fictitious data. No account and no database needed. Answers 404 in production.
 */
export default async function DesignLayout({ children }: LayoutProps<"/design">) {
  if (process.env.NODE_ENV === "production") notFound();
  const theme = await getThemePreference();
  return (
    <ToastProvider>
      <DesignShell theme={theme}>{children}</DesignShell>
    </ToastProvider>
  );
}
