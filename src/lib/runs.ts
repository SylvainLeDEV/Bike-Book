import type { ProductLevel } from "./enums";
import type { RunPartVM, RunStepVM } from "./view-models";

/*
 * A run's summary ("suivi", D-82, D-87): what it proposes before anything is written. Pure: the
 * server sets the defaults, the browser recomputes the cost as quantities change.
 */

/** A product used by a job goes one level down by default (D-47); "Vide" stays a choice. */
export function defaultLevelAfter(level: ProductLevel): ProductLevel {
  return level === "full" ? "started" : level === "started" ? "low" : level;
}

/** The levels a product can end at: its own, or lower ("Vide" finishes the open container). */
export function levelsAfter(level: ProductLevel): ProductLevel[] {
  const order: ProductLevel[] = ["full", "started", "low", "empty"];
  return order.slice(order.indexOf(level));
}

/**
 * The parts taken from the stock, at their last purchase price (D-38): the cost proposed, null
 * when none of them has a price.
 */
export function partsCostCents(
  parts: Pick<RunPartVM, "itemId" | "lastUnitCostCents">[],
  quantities: Record<number, number>,
): number | null {
  let priced = false;
  let total = 0;
  for (const part of parts) {
    const quantity = quantities[part.itemId] ?? 0;
    if (quantity > 0 && part.lastUnitCostCents != null) {
      priced = true;
      total += quantity * part.lastUnitCostCents;
    }
  }
  return priced ? total : null;
}

/** The steps not checked, numbered from 1: pointed out by the summary, never blocking. */
export function uncheckedSteps(steps: Pick<RunStepVM, "done">[]): number[] {
  return steps.flatMap((step, index) => (step.done ? [] : [index + 1]));
}

/** "Les étapes 2 et 4 ne sont pas cochées." */
export function uncheckedText(numbers: number[]): string | null {
  if (!numbers.length) return null;
  if (numbers.length === 1) return `L'étape ${numbers[0]} n'est pas cochée.`;
  const list = `${numbers.slice(0, -1).join(", ")} et ${numbers.at(-1)}`;
  return `Les étapes ${list} ne sont pas cochées.`;
}
