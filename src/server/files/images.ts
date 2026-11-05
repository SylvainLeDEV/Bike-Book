import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { dataPath, derivedDir, randomName } from "./storage";

// Derived copies of photos (D-20, D-72), made with sharp: the EXIF orientation applied
// (every iPhone photo tested had orientation 6, H-11) and no metadata at all, GPS included.
// They live in `cache/`, are made on first request and can be deleted at any time.

export const DERIVED_SIZES = {
  /**
   * Tiles, rows and pastilles (shown at 36 to 160 CSS px): the whole photo, its short side 480 px,
   * cropped by the page around the photo's focus point (D-103). `file` changed from the square
   * `thumb.webp` cut in the middle, so no browser or cache keeps serving the old one.
   */
  thumb: { width: 480, height: 480, fit: "outside", file: "thumb-full.webp" },
  /** The viewer and the bike cover. */
  display: { width: 1600, height: 1600, fit: "inside", file: "display.webp" },
} as const;

/** Copies made by an earlier version, removed when their replacement is made. */
const REPLACED_FILES: Partial<Record<DerivedSize, string>> = { thumb: "thumb.webp" };

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
  const target = dataPath(`${derivedDir(storage)}/${DERIVED_SIZES[size].file}`);
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
    const replaced = REPLACED_FILES[size];
    if (replaced) await fs.rm(dataPath(`${derivedDir(storage)}/${replaced}`), { force: true });
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
  return target;
}
