import { describe, expect, it } from "vitest";
import { parseProcedureInput } from "./procedure-input";

const input = (fields: Record<string, unknown> = {}) => ({
  title: "  Purge   des freins ",
  description: "",
  componentTypeCode: "brake",
  modelHint: " SRAM Maven ",
  bikes: [3],
  durationMin: 45,
  difficulty: "medium",
  steps: [
    { id: null, instruction: " Retirer la roue ", note: "", torqueNm: null },
    { id: 7, instruction: "Serrer", note: null, torqueNm: 6.8 },
  ],
  lines: [
    { target: "item", itemId: 2, quantity: null },
    { target: "type", componentTypeCode: "brake_pads", quantity: 1 },
    { target: "label", label: " Seringue ", quantity: null },
  ],
  resources: [
    {
      kind: "video",
      url: "https://video.example/purge",
      title: "Purge",
      durationS: 600,
      body: null,
    },
    { kind: "note", url: null, title: null, durationS: null, body: " Gants. " },
  ],
  ...fields,
});

describe("parseProcedureInput (D-86)", () => {
  it("cleans the text and turns minutes into seconds", () => {
    const parsed = parseProcedureInput(input());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data).toMatchObject({
      title: "Purge des freins",
      description: null,
      modelHint: "SRAM Maven",
      allBikes: false,
      bikeIds: [3],
      estimatedDurationS: 2700,
      steps: [
        { id: null, instruction: "Retirer la roue", note: null },
        { id: 7, torqueNm: 6.8 },
      ],
      items: [
        { inventoryItemId: 2, quantity: null },
        { componentTypeCode: "brake_pads", quantity: 1 },
        { label: "Seringue" },
      ],
      resources: [
        { kind: "video", durationS: 600 },
        { kind: "note", body: "Gants." },
      ],
    });
  });

  it("names the step, line or link an error is about", () => {
    const step = parseProcedureInput(
      input({ steps: [{ id: null, instruction: "  ", note: null, torqueNm: null }] }),
    );
    expect(step).toEqual({ ok: false, error: "Étape 1 : Chaque étape a besoin d'une consigne." });
    const link = parseProcedureInput(
      input({
        resources: [
          { kind: "link", url: "javascript:alert(1)", title: null, durationS: null, body: null },
        ],
      }),
    );
    expect(link.ok).toBe(false);
    if (!link.ok) expect(link.error).toMatch(/^Ressource 1 : Adresse invalide/);
    const torque = parseProcedureInput(
      input({ steps: [{ id: null, instruction: "Serrer", note: null, torqueNm: 0 }] }),
    );
    expect(torque).toEqual({ ok: false, error: "Étape 1 : Couple de serrage invalide." });
  });

  it("refuses an empty title, a duration on a link and a note with an address", () => {
    expect(parseProcedureInput(input({ title: "   " }))).toEqual({
      ok: false,
      error: "Donne un titre à la fiche.",
    });
    expect(
      parseProcedureInput(
        input({
          resources: [
            { kind: "link", url: "https://a.example", title: null, durationS: 60, body: null },
          ],
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseProcedureInput(
        input({
          resources: [
            { kind: "note", url: "https://a.example", title: null, durationS: null, body: "x" },
          ],
        }),
      ).ok,
    ).toBe(false);
  });
});
