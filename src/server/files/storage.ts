import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, rmSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/server/env";
import {
  detectFormat,
  MAX_UPLOAD_BYTES,
  SNIFF_BYTES,
  storagePath,
  type FileFormat,
} from "@/server/domain/attachments";

// Files of the attachments (feature 10) under the data directory (D-11): originals in
// `uploads/`, regenerable copies in `cache/` (left out of backups). Paths stored in the
// database are relative to the data directory; nothing outside it is ever read or written.

/** Partial uploads, on the same filesystem as `uploads/` so that the final rename is atomic. */
const TEMP_DIR = "uploads/.tmp";

export type UploadRefusal = "too_large" | "heic" | "unsupported" | "empty" | "aborted";

export class UploadError extends Error {
  constructor(readonly reason: UploadRefusal) {
    super(`Upload refused: ${reason}`);
  }
}

/** An absolute path for a path relative to the data directory; refuses to leave it. */
export function dataPath(relative: string): string {
  const root = path.resolve(getEnv().dataDir);
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) throw new Error(`Path outside DATA_DIR: ${relative}`);
  return absolute;
}

/** A random lower-case name: 128 bits, never derived from the file or its owner. */
export function randomName(): string {
  return randomBytes(16).toString("hex");
}

export type ReceivedFile = {
  /** Relative to the data directory, under `uploads/.tmp/`. */
  tempPath: string;
  format: FileFormat;
  sizeBytes: number;
  sha256: string;
};

/**
 * Streams a request body to a temporary file: the format is checked from the first bytes
 * (before anything else is accepted), the size while it flows (a Content-Length can lie), the
 * SHA-256 on the way. On any refusal or error the temporary file is removed and the stream
 * cancelled, so a refused 25 MB upload stops at its first chunk or at the limit.
 */
export async function receiveFile(
  body: ReadableStream<Uint8Array>,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<ReceivedFile> {
  const tempPath = `${TEMP_DIR}/${randomName()}.part`;
  const absolute = dataPath(tempPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const out = createWriteStream(absolute, { flags: "wx" });
  const outDone = new Promise<void>((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });
  outDone.catch(() => {}); // Awaited on success; on failure the catch below cleans up.
  const hash = createHash("sha256");
  const reader = body.getReader();
  let size = 0;
  let head: Uint8Array = new Uint8Array(0);
  let format: FileFormat | null = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new UploadError("too_large");
      if (!format) {
        head = concat(head, value.subarray(0, SNIFF_BYTES - head.length));
        if (head.length >= SNIFF_BYTES) format = checkFormat(head);
      }
      hash.update(value);
      if (!out.write(value))
        await new Promise<void>((resolve) => out.once("drain", () => resolve()));
    }
    if (size === 0) throw new UploadError("empty");
    format ??= checkFormat(head);
    out.end();
    await outDone;
    return { tempPath, format, sizeBytes: size, sha256: hash.digest("hex") };
  } catch (error) {
    await reader.cancel().catch(() => {});
    // The file is opened asynchronously: wait until the stream is closed, or the removal could
    // run before the file even exists.
    const closed = new Promise<void>((resolve) => out.once("close", () => resolve()));
    out.destroy();
    if (!out.closed) await closed;
    await fs.rm(absolute, { force: true });
    // The browser went away mid-upload: the body stream errors.
    throw error instanceof UploadError ? error : new UploadError("aborted");
  }
}

function checkFormat(head: Uint8Array): FileFormat {
  const detection = detectFormat(head);
  if (!detection.ok) throw new UploadError(detection.reason);
  return detection.format;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/** Moves a received file to its final place (`uploads/YYYY/MM/<random>.<ext>`), atomically. */
export async function commitFile(file: ReceivedFile, uploadedAt: number): Promise<string> {
  const finalPath = storagePath(uploadedAt, randomName(), file.format);
  const absolute = dataPath(finalPath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.rename(dataPath(file.tempPath), absolute);
  return finalPath;
}

/** Removes a file that will not be kept (refused after reception, row not written). */
export async function discardFile(relative: string): Promise<void> {
  await fs.rm(dataPath(relative), { force: true });
}

/** The folder of the derived copies of an original: `cache/<its path without extension>/`. */
export function derivedDir(storage: string): string {
  return `cache/${storage.replace(/\.[a-z0-9]+$/, "")}`;
}

/**
 * Deletes originals and their derived copies once their rows are gone. Synchronous, so the
 * data-access functions that delete rows stay synchronous. Never throws: a file that cannot be
 * removed is logged (an orphan to delete by hand), the database stays the truth.
 */
export function removeStoredFiles(storagePaths: string[]): void {
  for (const storage of storagePaths) {
    try {
      rmSync(dataPath(storage), { force: true });
      rmSync(dataPath(derivedDir(storage)), { recursive: true, force: true });
    } catch (error) {
      console.error(`Could not delete the files of ${storage}:`, error);
    }
  }
}

/** Server start: partial uploads left by a crash or a restart are removed. */
export async function clearPartialUploads(): Promise<void> {
  await fs.rm(dataPath(TEMP_DIR), { recursive: true, force: true });
}
