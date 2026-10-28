import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { dataPath, derivedDir, randomName } from "./storage";

// Derived copies of photos (D-20, D-72), made with sharp: the EXIF orientation applied
// (every iPhone photo tested had orientation 6, H-11) and no metadata at all, GPS included.
// They live in `cache/`, are made on first request and can be deleted at any time.

export const DERIVED_SIZES = {
  /** Square tiles of the galleries and rows (shown at 48 to 160 CSS px). */
  thumb: { width: 320, height: 320, fit: "cover" },
  /** The viewer and the bike cover. */
  display: { width: 1600, height: 1600, fit: "inside" },
} as const;

export type DerivedSize = keyof typeof DERIVED_SIZES;

export function isDerivedSize(value: string | null): value is DerivedSize {
  return value === "thumb" || value === "display";
}

/**
 * Size (as displayed, orientation applied) and EXIF block of an uploaded image. Throws when
 * sharp cannot decode it: a file that only starts like an image is refused.
 */
export async function inspectImage(
  relative: string,
): Promise<{ widthPx: number; heightPx: number; exif: Buffer | null }> {
  const metadata = await sharp(dataPath(relative)).metadata();
  const { width, height } = metadata.autoOrient;
  if (!width || !height) throw new Error("Image without dimensions");
  return { widthPx: width, heightPx: height, exif: metadata.exif ?? null };
}

/** The derived copy of an original, made now if it is missing. Absolute path of a WebP file. */
export async function derivedFile(storage: string, size: DerivedSize): Promise<string> {
  const target = dataPath(`${derivedDir(storage)}/${size}.webp`);
  try {
    await fs.access(target);
    return target;
  } catch {
    // Not made yet, or the cache was cleared.
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  // Written next to its final name, then renamed: two requests at once never serve half a file.
  const temp = `${target}.${randomName()}.tmp`;
  const { width, height, fit } = DERIVED_SIZES[size];
  try {
    await sharp(dataPath(storage))
      .rotate() // Applies the EXIF orientation; sharp writes no metadata unless asked to.
      .resize({ width, height, fit, withoutEnlargement: true })
      .webp({ quality: size === "thumb" ? 72 : 82 })
      .toFile(temp);
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
  return target;
}
