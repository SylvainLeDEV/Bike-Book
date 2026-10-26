/** Names typed by hand (bikes, shops): client-safe, so forms compare them like the server. */

/** A name typed by hand, trimmed and with its inner spaces collapsed. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * The key two names are compared on: "Le Lourd", "le  lourd" and "Le Lourd " are the same name,
 * so are "Vélo" and "Velo". Computed by the app, so SQLite and PostgreSQL behave alike.
 */
export function nameKey(name: string): string {
  return cleanName(name)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr");
}
