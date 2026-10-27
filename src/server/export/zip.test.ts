import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { crc32, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { zip, type ZipEntry, type ZipTime } from "./zip";

const TIME: ZipTime = { year: 2026, month: 10, day: 25, hour: 14, minute: 30, second: 58 };

async function build(entries: ZipEntry[]) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of zip(entries, TIME)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Reads the archive back from its central directory, as an unzip tool would. */
function read(archive: Buffer) {
  const end = archive.length - 22;
  expect(archive.readUInt32LE(end)).toBe(0x06054b50);
  const count = archive.readUInt16LE(end + 10);
  let at = archive.readUInt32LE(end + 16);
  const files: { name: string; data: Buffer; method: number; date: number; time: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(archive.readUInt32LE(at)).toBe(0x02014b50);
    const method = archive.readUInt16LE(at + 10);
    const time = archive.readUInt16LE(at + 12);
    const date = archive.readUInt16LE(at + 14);
    const crc = archive.readUInt32LE(at + 16);
    const compressedSize = archive.readUInt32LE(at + 20);
    const size = archive.readUInt32LE(at + 24);
    const nameLength = archive.readUInt16LE(at + 28);
    const offset = archive.readUInt32LE(at + 42);
    const name = archive.toString("utf8", at + 46, at + 46 + nameLength);
    expect(archive.readUInt32LE(offset)).toBe(0x04034b50);
    const start =
      offset + 30 + archive.readUInt16LE(offset + 26) + archive.readUInt16LE(offset + 28);
    const body = archive.subarray(start, start + compressedSize);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    expect(data.length).toBe(size);
    expect(crc32(data)).toBe(crc);
    files.push({ name, data, method, date, time });
    at += 46 + nameLength + archive.readUInt16LE(at + 30) + archive.readUInt16LE(at + 32);
  }
  return files;
}

describe("zip", () => {
  const csv = Buffer.from("id,name\r\n1,Spectral\r\n".repeat(200));
  const entries: ZipEntry[] = [
    { name: "csv/bikes.csv", data: csv },
    { name: "LISEZMOI.txt", data: Buffer.from("Données exportées : vélos, sorties…") },
    { name: "a.txt", data: Buffer.from("a") },
    {
      name: "uploads/photo.jpg",
      data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
      compress: false,
    },
    { name: "empty.json", data: new Uint8Array() },
  ];

  it("writes entries that read back with their names, contents and checksums", async () => {
    const files = read(await build(entries));
    expect(files.map((f) => f.name)).toEqual(entries.map((e) => e.name));
    files.forEach((file, i) => expect(file.data.equals(Buffer.from(entries[i].data))).toBe(true));
  });

  it("deflates text and stores what does not shrink or must not be compressed", async () => {
    const files = read(await build(entries));
    expect(files.map((f) => f.method)).toEqual([8, 8, 0, 0, 0]);
  });

  it("encodes the wall-clock time in DOS format", async () => {
    const [file] = read(await build(entries.slice(0, 1)));
    expect(file.date).toBe(((2026 - 1980) << 9) | (10 << 5) | 25);
    expect(file.time).toBe((14 << 11) | (30 << 5) | 29);
  });

  it("writes a valid empty archive", async () => {
    expect(read(await build([]))).toEqual([]);
  });

  // The system unzip, when there is one, checks the archive independently of the reader above.
  const hasUnzip = (() => {
    try {
      execFileSync("unzip", ["-v"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  it.runIf(hasUnzip)("passes unzip -t", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "bikebook-zip-"));
    try {
      const file = path.join(dir, "export.zip");
      writeFileSync(file, await build(entries));
      const output = execFileSync("unzip", ["-t", file], { encoding: "utf8" });
      expect(output).toContain("No errors detected");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
