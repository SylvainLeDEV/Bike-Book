import "server-only";

// Why a call to Garmin failed, as the import and Paramètres need to tell it. Messages are French
// (shown in the app, H-01); they never contain the key, a token or a response body.

export type GarminErrorKind =
  /** 401 twice (or on the key exchange): the key is invalid, expired or revoked. */
  | "key_rejected"
  /** 429 after every retry. */
  | "rate_limited"
  /** Network errors or 5xx after every retry. */
  | "unavailable"
  /** Any other status, or an answer that does not have the expected shape. */
  | "unexpected";

const MESSAGES: Record<GarminErrorKind, string> = {
  key_rejected:
    "Garmin refuse la clé : elle est invalide, expirée ou révoquée. Crée une nouvelle clé dans Garmin Connect (Paramètres → Clé API personnelle) et enregistre-la ici.",
  rate_limited:
    "Garmin limite les appels pour l'instant (trop de requêtes). L'import reprendra au prochain passage.",
  unavailable:
    "Garmin ne répond pas (réseau ou serveur indisponible). L'import reprendra au prochain passage.",
  unexpected: "Garmin a donné une réponse inattendue. L'import reprendra au prochain passage.",
};

export class GarminError extends Error {
  constructor(
    readonly kind: GarminErrorKind,
    /** For the logs only: a status code or an error name, never a body. */
    readonly detail?: string,
  ) {
    super(`Garmin: ${kind}${detail ? ` (${detail})` : ""}`);
    this.name = "GarminError";
  }

  /** What the app shows. */
  get userMessage(): string {
    return MESSAGES[this.kind];
  }
}
