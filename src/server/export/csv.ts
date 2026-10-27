import "server-only";

/*
 * CSV as in RFC 4180: comma-separated, CRLF line ends, UTF-8, a header row with the SQL column
 * names. Empty means null (the JSON files keep the difference with an empty text); booleans
 * are true/false, JSON values their JSON text.
 */

function cell(value: unknown): string {
  if (value == null) return "";
  const text =
    typeof value === "string"
      ? value
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(cell).join(",") + "\r\n").join("");
}
