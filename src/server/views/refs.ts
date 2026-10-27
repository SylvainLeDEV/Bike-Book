import "server-only";
import type { BikeRef } from "@/lib/view-models";
import type { Bike } from "@/server/db";

/** A bike as lists and pastilles name it. No photo yet (feature 10): one art palette per bike. */
export function bikeRef(bike: Pick<Bike, "id" | "name">): BikeRef {
  return { id: bike.id, name: bike.name, cover: { photoUrl: null, artIndex: bike.id - 1 } };
}
