import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { getEnv } from "@/server/env";

// Secrets the app must use again later, such as a provider's personal API key (D-101): stored
// encrypted with AES-256-GCM, under a key derived from AUTH_SECRET (HKDF-SHA256, one purpose per
// key). The database or a backup of the data directory alone does not give them: AUTH_SECRET
// lives in the environment. Changing AUTH_SECRET makes them unreadable: they are typed again.

const VERSION = "v1";

function encryptionKey(purpose: string, authSecret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", authSecret, "bike-book", `secret:${purpose}`, 32));
}

/** `v1.<iv>.<tag>.<ciphertext>`, base64url; `purpose` binds it to one use. */
export function encryptSecret(
  plain: string,
  purpose: string,
  authSecret = getEnv().authSecret,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(purpose, authSecret), iv);
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** The secret, or null when it cannot be read (another AUTH_SECRET, another purpose, tampered). */
export function decryptSecret(
  sealed: string,
  purpose: string,
  authSecret = getEnv().authSecret,
): string | null {
  const [version, iv, tag, ciphertext, extra] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext == null || extra !== undefined) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(purpose, authSecret),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(purpose));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
