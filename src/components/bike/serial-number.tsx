"use client";

import * as React from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { maskSerial, serialEnd } from "@/lib/display";

/**
 * Frame number, masked except its last group (D-43): "Afficher" has a pressed state, "Copier"
 * puts the full number in the clipboard without showing it.
 */
export function SerialNumber({ serial }: { serial: string }) {
  const [shown, setShown] = React.useState(false);
  const toast = useToast();
  const spelled = (text: string) => text.replace(/\s+/g, "").split("").join(" ");

  async function copy() {
    try {
      await navigator.clipboard.writeText(serial);
      toast("Numéro de cadre copié");
    } catch {
      toast("Copie impossible ici : affiche le numéro pour le recopier");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="mr-auto num text-[22px] leading-tight font-semibold tracking-[0.08em] break-all">
        <span aria-hidden>{shown ? serial : maskSerial(serial)}</span>
        <span className="sr-only">
          {shown ? spelled(serial) : `Masqué, se termine par ${spelled(serialEnd(serial))}`}
        </span>
      </span>
      <span className="-ml-3 flex gap-1">
        <Button variant="ghost" size="sm" aria-pressed={shown} onClick={() => setShown((v) => !v)}>
          {shown ? <EyeOff /> : <Eye />}
          {shown ? "Masquer" : "Afficher"}
        </Button>
        <Button variant="ghost" size="sm" onClick={copy}>
          <Copy />
          Copier
        </Button>
      </span>
    </div>
  );
}
