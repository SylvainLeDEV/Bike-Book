import { describe, expect, it } from "vitest";
import { attachmentEditSchema, toAttachmentPatch } from "./attachment-input";

const TZ = "Europe/Paris";

describe("attachment edits", () => {
  it("turns the date and time taken into an instant in TZ, noon without a time", () => {
    const base = { caption: "  Joints  ", kind: "photo" as const, takenOn: "2026-10-12" };
    const withTime = attachmentEditSchema.parse({ ...base, takenTime: "14:03" });
    expect(toAttachmentPatch(withTime, TZ)).toEqual({
      caption: "Joints",
      kind: "photo",
      takenAt: Date.UTC(2026, 9, 12, 12, 3),
    });
    const noTime = attachmentEditSchema.parse({ ...base, takenTime: null });
    expect(toAttachmentPatch(noTime, TZ).takenAt).toBe(Date.UTC(2026, 9, 12, 10));
  });

  it("leaves the date of a PDF alone and refuses what is not a phase 1 kind", () => {
    const pdf = attachmentEditSchema.parse({
      caption: "",
      kind: "invoice",
      takenOn: null,
      takenTime: null,
    });
    expect(toAttachmentPatch(pdf, TZ)).toEqual({ caption: null, kind: "invoice" });
    for (const bad of [
      { caption: null, kind: "track", takenOn: null, takenTime: null },
      { caption: null, kind: "photo", takenOn: "2026-02-30", takenTime: null },
      { caption: null, kind: "photo", takenOn: "2026-02-03", takenTime: "25:00" },
    ]) {
      expect(attachmentEditSchema.safeParse(bad).success).toBe(false);
    }
  });
});
