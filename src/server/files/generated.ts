import "server-only";
import sharp from "sharp";

// Generated files for the demo seed and the tests (D-22: no real photo or invoice in the
// repository). Photos are flat illustrations written like an iPhone photo would be: stored
// sideways with EXIF orientation 6, a date taken with its offset and a made-up GPS position
// (H-11), so the demo exercises the rotation and the metadata stripping (D-72).

export type GeneratedPhoto = {
  /** Displayed size (after orientation). */
  width: number;
  height: number;
  /** Two illustration colours (they stand in for a photo, like the bike covers). */
  sky: string;
  ground: string;
  label: string;
  /** "2026:10:12 14:03:22" and "+02:00"; omitted like a photo taken from the picker's camera. */
  dateTimeOriginal?: string;
  offsetTimeOriginal?: string;
  /** Written sideways with orientation 6, as every iPhone photo tested was (default true). */
  sideways?: boolean;
};

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A JPEG that looks the right way up only once its EXIF orientation is applied. */
export async function generatedPhoto(photo: GeneratedPhoto): Promise<Buffer> {
  const { width, height, sky, ground, label } = photo;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${sky}"/>
    <path d="M0 ${height * 0.7} L${width * 0.3} ${height * 0.45} L${width * 0.6} ${height * 0.62} L${width} ${height * 0.4} V${height} H0 Z" fill="${ground}"/>
    <circle cx="${width * 0.8}" cy="${height * 0.2}" r="${Math.min(width, height) * 0.08}" fill="#f6e7b4"/>
    <text x="${width / 2}" y="${height * 0.88}" font-family="sans-serif" font-size="${Math.round(height / 12)}" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(label)}</text>
    <text x="${width * 0.04}" y="${height * 0.1}" font-family="sans-serif" font-size="${Math.round(height / 16)}" fill="#ffffff">HAUT</text>
  </svg>`;
  const sideways = photo.sideways ?? true;
  // Orientation 6 means "rotate 90° clockwise to display": store it turned the other way.
  let image = sharp(Buffer.from(svg)).rotate(sideways ? -90 : 0);
  image = image.jpeg({ quality: 82 }).withExif({
    IFD0: { Make: "Exemple", Model: "Appareil fictif" },
    ...(photo.dateTimeOriginal
      ? {
          IFD2: {
            DateTimeOriginal: photo.dateTimeOriginal,
            ...(photo.offsetTimeOriginal ? { OffsetTimeOriginal: photo.offsetTimeOriginal } : {}),
          },
        }
      : {}),
    // A made-up position in the sea, kept in the original only (D-72).
    IFD3: {
      GPSLatitudeRef: "N",
      GPSLatitude: "0/1 0/1 0/1",
      GPSLongitudeRef: "W",
      GPSLongitude: "30/1 0/1 0/1",
    },
  });
  if (sideways) image = image.withMetadata({ orientation: 6 });
  return image.toBuffer();
}

/** A one-page PDF with a few lines of text (a fictitious invoice or manual). */
export function generatedPdf(title: string, lines: string[]): Buffer {
  // Latin-1 text in the standard Helvetica font: enough for French accents.
  const escape = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`);
  const content = [
    "BT /F1 20 Tf 56 770 Td",
    `(${escape(title)}) Tj`,
    "/F1 12 Tf 0 -36 Td",
    ...lines.flatMap((line) => [`(${escape(line)}) Tj`, "0 -18 Td"]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

/** A body stream of these bytes, cut in chunks like a network request. */
export function streamOf(bytes: Uint8Array, chunkSize = 64 * 1024): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
}
