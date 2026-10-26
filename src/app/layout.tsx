import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Barlow_Semi_Condensed, Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { themeAttribute } from "@/lib/theme";
import { getThemePreference } from "@/server/theme";

// Both fonts are downloaded at build time and served by the app: no request to Google at runtime.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const barlow = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow",
});

export const metadata: Metadata = {
  title: "Bike-Book",
  description: "Suivi de tes vélos : sorties, entretien et pièces.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The theme comes from a cookie so the first byte already has the right one (D-52).
  const theme = themeAttribute(await getThemePreference());

  return (
    <html
      lang="fr"
      data-theme={theme}
      className={cn("h-full antialiased", geist.variable, barlow.variable)}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
