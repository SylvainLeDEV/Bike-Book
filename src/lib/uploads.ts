/**
 * Upload rules shared by the browser and the server (feature 10). Client-safe: the browser
 * checks the size before sending, the server checks everything again from the content.
 */

import { DOCUMENT_KINDS, type AttachmentKind } from "./enums";

/** 25 MB per file (04 Security). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * `accept` of every file input: JPEG first, no HEIC (D-46, D-73). Safari on iPhone sends JPEG
 * whatever this says (H-11); the list only steers the other browsers' pickers.
 */
export const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

/** Why an upload was refused, as the server answers it. */
export type UploadErrorCode =
  | "too_large"
  | "heic"
  | "unsupported"
  | "unreadable"
  | "empty"
  | "aborted"
  | "not_found"
  | "signed_out"
  | "invalid";

export const UPLOAD_ERROR_MESSAGES: Record<UploadErrorCode, string> = {
  too_large: "Fichier trop gros : 25 Mo maximum.",
  heic: "Format HEIC non pris en charge : envoie la photo depuis la photothèque de l'iPhone, ou exporte-la en JPEG.",
  unsupported: "Format refusé : seules les photos JPEG, PNG ou WebP et les PDF sont acceptés.",
  unreadable: "Image illisible : le fichier est peut-être abîmé.",
  empty: "Fichier vide.",
  aborted: "Envoi interrompu. Réessaie.",
  not_found: "Cet élément n'existe plus.",
  signed_out: "Ta session a expiré : reconnecte-toi.",
  invalid: "Envoi refusé.",
};

/** The kinds a file may be given in phase 1 (D-74): a PDF is never a photo, `track` is phase 2. */
export function allowedKinds(isImage: boolean): AttachmentKind[] {
  return isImage ? ["photo", ...DOCUMENT_KINDS] : [...DOCUMENT_KINDS];
}
