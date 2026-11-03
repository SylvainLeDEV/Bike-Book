"use client";

import * as React from "react";
import { Check, Copy, KeyRound, Plus, TriangleAlert } from "lucide-react";
import { DeleteConfirm } from "@/components/delete-confirm";
import { Button } from "@/components/ui/button";
import { Card, List } from "@/components/ui/card";
import { Field, FieldError, Input } from "@/components/ui/field";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetForm } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDayLabel, type LocalDate } from "@/lib/format";
import type { ApiTokenVM, CreateApiTokenResult } from "@/lib/view-models";

/*
 * "Accès pour un assistant" in Paramètres (D-90): personal tokens for the MCP endpoint. A new
 * token is shown once, in the sheet that created it, with "Copier" and the Claude Code command;
 * the list shows only its first characters. "Révoquer" asks first (D-70).
 */

export type ApiTokensProps = {
  tokens: ApiTokenVM[];
  /** The MCP endpoint, from PUBLIC_URL. */
  mcpUrl: string;
  today: LocalDate;
  onCreate: (name: string) => Promise<CreateApiTokenResult>;
  /** Resolves with an error message, or null once revoked. */
  onRevoke: (tokenId: number) => Promise<string | null>;
};

/**
 * Copies to the clipboard. The Clipboard API needs a secure context, which plain HTTP on a
 * private network (D-15) is not: fall back to the older copy command on a hidden field.
 */
async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused (permissions): try the fallback.
    }
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

function CopyBlock({
  label,
  value,
  copyLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
}) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  const id = React.useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13.5px] leading-tight font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        readOnly
        rows={value.length > 60 ? 3 : 1}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-none rounded-control border border-border bg-surface-2 px-3 py-2 font-mono text-[13px] leading-[1.45] break-all"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={async () => setState((await copyText(value)) ? "copied" : "failed")}
        >
          {state === "copied" ? <Check /> : <Copy />}
          {state === "copied" ? "Copié" : copyLabel}
        </Button>
        <span role="status" className="text-[13px] text-fg-muted">
          {state === "failed" ? "Copie impossible ici : sélectionne le texte et copie-le." : ""}
        </span>
      </div>
    </div>
  );
}

function NewTokenForm({
  mcpUrl,
  onCreate,
  onDone,
}: {
  mcpUrl: string;
  onCreate: ApiTokensProps["onCreate"];
  onDone: () => void;
}) {
  const [name, setName] = React.useState("");
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [created, setCreated] = React.useState<{ token: string; name: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError("Donne un nom au jeton.");
      return;
    }
    setNameError(null);
    setError(null);
    setPending(true);
    try {
      const result = await onCreate(name.trim());
      if (result.ok) setCreated({ token: result.token, name: result.name });
      else {
        setNameError(result.fieldErrors?.name ?? null);
        setError(result.error ?? null);
      }
    } catch {
      setError("Création impossible. Vérifie la connexion et réessaie.");
    } finally {
      setPending(false);
    }
  }

  if (created) {
    const command = `claude mcp add --transport http --scope user bike-book ${mcpUrl} --header "Authorization: Bearer ${created.token}"`;
    return (
      <>
        <SheetBody>
          <p className="flex items-start gap-2 rounded-control bg-soon-soft px-3 py-2.5 text-[14px] leading-[1.45] text-soon-ink">
            <TriangleAlert className="mt-0.5 size-[17px] shrink-0" aria-hidden />
            <span>
              Copie le jeton « {created.name} » maintenant : il ne sera plus jamais affiché.
              Garde-le comme un mot de passe.
            </span>
          </p>
          <CopyBlock label="Jeton" value={created.token} copyLabel="Copier le jeton" />
          <CopyBlock
            label="Commande pour Claude Code"
            value={command}
            copyLabel="Copier la commande"
          />
          <p className="hint">
            La commande enregistre le serveur «&nbsp;bike-book&nbsp;» pour toutes tes sessions
            Claude Code, avec ce jeton.
          </p>
        </SheetBody>
        <SheetFooter>
          <Button type="button" size="lg" className="w-full" onClick={onDone}>
            <Check />
            Terminé
          </Button>
        </SheetFooter>
      </>
    );
  }

  return (
    <SheetForm onSubmit={submit}>
      <SheetBody>
        {error ? <FieldError>{error}</FieldError> : null}
        <Field label="Nom" hint="Pour le reconnaître dans la liste." error={nameError}>
          <Input
            autoComplete="off"
            maxLength={60}
            placeholder="Ex. Claude Code sur le Mac"
            value={name}
            data-autofocus=""
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
      </SheetBody>
      <SheetFooter>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <KeyRound />
          Créer le jeton
        </Button>
      </SheetFooter>
    </SheetForm>
  );
}

function TokenRow({
  token,
  today,
  onRevoke,
}: {
  token: ApiTokenVM;
  today: LocalDate;
  onRevoke: ApiTokensProps["onRevoke"];
}) {
  const toast = useToast();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const created = formatDate(token.createdOn, { month: "short", year: "auto", today });
  const lastUsed = token.lastUsed
    ? `${formatDayLabel(token.lastUsed.on, today).toLowerCase()} à ${token.lastUsed.time}`
    : null;

  return (
    <li className="grid gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate font-semibold">{token.name}</p>
          <p className="text-[13.5px] text-fg-muted">
            <span className="font-mono text-[12.5px]">{token.tokenStart}…</span> · créé le {created}
          </p>
          <p className="text-[13.5px] text-fg-muted">
            {lastUsed ? `Dernière utilisation : ${lastUsed}` : "Jamais utilisé"}
          </p>
        </div>
        {confirming ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-late-ink hover:text-late-ink"
            onClick={() => setConfirming(true)}
          >
            Révoquer
          </Button>
        )}
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      {confirming ? (
        <DeleteConfirm
          question={`Révoquer « ${token.name} » ? L'assistant qui s'en sert perdra l'accès, et ce jeton ne marchera plus jamais.`}
          confirmLabel="Révoquer le jeton"
          pending={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={async () => {
            setPending(true);
            setError(null);
            try {
              const failure = await onRevoke(token.id);
              if (failure) setError(failure);
              else toast("Jeton révoqué");
            } catch {
              setError("Révocation impossible. Vérifie la connexion et réessaie.");
            } finally {
              setPending(false);
              setConfirming(false);
            }
          }}
        />
      ) : null}
    </li>
  );
}

export function ApiTokensSection({ tokens, mcpUrl, today, onCreate, onRevoke }: ApiTokensProps) {
  const [sheet, setSheet] = React.useState({ open: false, key: 0 });
  return (
    <Card padded className="grid gap-3">
      <p className="text-[14.5px]">
        Un jeton personnel laisse un assistant, comme Claude Code sur ton ordinateur, lire et
        enregistrer tes vélos et leurs pièces à ta place, par le serveur MCP de Bike-Book. Il agit
        en ton nom et ne peut rien supprimer.
      </p>
      <p className="text-[13.5px] text-fg-muted">
        Ce que l&apos;assistant lit part chez son fournisseur, hors de ton réseau. Révoque un jeton
        dès qu&apos;il ne sert plus. Adresse du serveur :{" "}
        <span className="font-mono text-[12.5px] break-all text-fg">{mcpUrl}</span>
      </p>
      {tokens.length > 0 ? (
        <List aria-label="Jetons" className="border-t border-border pt-3">
          {tokens.map((token) => (
            <TokenRow key={token.id} token={token} today={today} onRevoke={onRevoke} />
          ))}
        </List>
      ) : (
        <p className="text-[13.5px] text-fg-muted">Aucun jeton pour l&apos;instant.</p>
      )}
      <div>
        <Button
          variant="secondary"
          onClick={() => setSheet((s) => ({ open: true, key: s.key + 1 }))}
        >
          <Plus />
          Nouveau jeton
        </Button>
      </div>
      <Sheet open={sheet.open} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}>
        <SheetContent
          title="Nouveau jeton"
          description="Pour un assistant qui passe par le serveur MCP."
        >
          <NewTokenForm
            key={sheet.key}
            mcpUrl={mcpUrl}
            onCreate={onCreate}
            onDone={() => setSheet((s) => ({ ...s, open: false }))}
          />
        </SheetContent>
      </Sheet>
    </Card>
  );
}
