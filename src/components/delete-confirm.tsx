import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The second step of "Supprimer…" in a sheet footer (D-70): the question, then confirm or keep. */
export function DeleteConfirm({
  question,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  question: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="group" aria-label={confirmLabel} className="grid gap-2">
      <p className="text-[13.5px] leading-[1.45]">{question}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Garder
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={onConfirm}
          // Focus moves from "Supprimer…", which this step replaces.
          autoFocus
        >
          <Trash2 />
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
