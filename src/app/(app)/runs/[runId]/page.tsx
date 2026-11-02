import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAccessContext } from "@/server/auth/context";
import { getRunPage } from "@/server/views/runs";
import { RunView } from "./run-view";

export const metadata: Metadata = { title: "Suivi · Bike-Book" };

/** The id from the URL, or null when it cannot be a run id. */
function parseRunId(raw: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

/** A run ("suivi", D-87): its own page, so it is resumed after a reload or on another device. */
export default async function RunPage({ params }: PageProps<"/runs/[runId]">) {
  const id = parseRunId((await params).runId);
  if (id == null) notFound();
  const vm = getRunPage(await requireAccessContext(), id);
  if (!vm) notFound();
  return <RunView vm={vm} />;
}
