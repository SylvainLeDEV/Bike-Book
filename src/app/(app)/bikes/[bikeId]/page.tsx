import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseBikeTab } from "@/lib/bike-tabs";
import { parseHistoryFilter } from "@/lib/history-filter";
import { requireAccessContext } from "@/server/auth/context";
import { getBike } from "@/server/db";
import { getBikePage } from "@/server/views/bikes";
import { BikeView } from "./bike-view";

/** The id from the URL, or null when it cannot be a bike id. */
function parseBikeId(raw: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/bikes/[bikeId]">): Promise<Metadata> {
  const id = parseBikeId((await params).bikeId);
  const bike = id == null ? null : getBike(await requireAccessContext(), id);
  return { title: bike ? `${bike.name} · Bike-Book` : "Vélo introuvable · Bike-Book" };
}

export default async function BikePage({ params, searchParams }: PageProps<"/bikes/[bikeId]">) {
  const id = parseBikeId((await params).bikeId);
  if (id == null) notFound();
  const page = getBikePage(await requireAccessContext(), id);
  if (!page) notFound();
  const query = await searchParams;
  const number = (value: unknown) => {
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  };
  // ?done=<rule>: "C'est fait" from the dashboard; ?replace=<item>: "Monter sur…" from the workshop;
  // ?event=<maintenance event>: an entry of Activité to edit (D-70). ?tab= and the history's
  // ?year=, ?month=, ?kind= keep the view (D-78).
  return (
    <BikeView
      page={page}
      doneRuleId={number(query.done)}
      replaceItemId={number(query.replace)}
      editEventId={number(query.event)}
      tab={parseBikeTab(query.tab)}
      historyFilter={parseHistoryFilter(query)}
    />
  );
}
