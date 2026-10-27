/**
 * Reading numbers typed in French forms (H-01): "4 299,00", "15,2", "1 234.5". Client-safe; the
 * server validates the converted values again (Zod).
 */

import { formatDecimal } from "./format";

const DECIMAL = /^\d+(?:[.,]\d+)?$/;

/** A number shown in a form field: "15,2" rather than "15,200", "1 500" rather than "1 500,0". */
export function decimalText(value: number, maxDigits: number): string {
  const text = formatDecimal(value, maxDigits);
  return text.includes(",") ? text.replace(/0+$/, "").replace(/,$/, "") : text;
}

/**
 * A positive number typed the French way, spaces (any kind) between thousands and a decimal
 * comma or point. `null` when the text is empty, `NaN` when it is not a number.
 */
export function parseDecimalInput(text: string): number | null {
  const compact = text.replace(/[\s  ]/g, "");
  if (!compact) return null;
  if (!DECIMAL.test(compact)) return Number.NaN;
  return Number(compact.replace(",", "."));
}

/** Euros typed by hand to cents: "4 299,00" → 429900. */
export function parseMoneyInput(text: string): number | null {
  const euros = parseDecimalInput(text);
  return euros == null || Number.isNaN(euros) ? euros : Math.round(euros * 100);
}
