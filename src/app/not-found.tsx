import type { Metadata } from "next";
import Link from "next/link";
import { BikeLine } from "@/components/bike-cover";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page introuvable · Bike-Book" };

/** Unknown address (and /design in production). */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="grid h-[92px] w-[132px] place-items-center rounded-[26px] bg-brand-soft text-brand-ink">
        <BikeLine className="w-[92px]" />
      </div>
      <h1 className="mt-2 text-[22px] font-[650] tracking-[-0.015em]">Page introuvable</h1>
      <p className="max-w-[36ch] text-sm text-fg-muted">
        Cette adresse ne mène nulle part dans Bike-Book.
      </p>
      <Button asChild className="mt-2">
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>
    </main>
  );
}
