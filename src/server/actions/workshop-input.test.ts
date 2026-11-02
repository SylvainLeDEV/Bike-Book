import { describe, expect, it } from "vitest";
import { itemData, itemInputSchema, itemOpening } from "./workshop-input";

const common = {
  name: "  Huile   minérale ",
  brand: "",
  reference: null,
  category: "brakes",
  componentTypeCode: "brake",
  bikes: [1, 2],
  location: null,
  link: null,
  notes: "",
};

describe("itemInputSchema (D-85)", () => {
  it("reads a product: containers, the open one's level, the container's name", () => {
    const parsed = itemInputSchema.safeParse({
      ...common,
      kind: "product",
      containers: 2,
      level: "started",
      containerLabel: " Pot  à graisse ",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({ name: "Huile minérale", brand: null, notes: null });
    expect(itemData(parsed.data)).toMatchObject({
      unit: null,
      lowStockThreshold: null,
      containerLabel: "pot à graisse",
      bikeIds: [1, 2],
    });
    expect(itemOpening(parsed.data)).toEqual({
      initialQuantity: 2,
      initialLevel: "started",
      toOrder: false,
    });
  });

  it("puts a tool not owned on « À commander »", () => {
    const parsed = itemInputSchema.safeParse({ ...common, kind: "tool", owned: false });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(itemOpening(parsed.data)).toEqual({
      initialQuantity: 0,
      initialLevel: null,
      toOrder: true,
    });
    expect(itemData(parsed.data)).toMatchObject({ unit: null, containerLabel: null });
  });

  it("keeps a part's unit and alert level", () => {
    const parsed = itemInputSchema.safeParse({
      ...common,
      kind: "part",
      quantity: 3,
      unit: "pair",
      lowStockThreshold: 1,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(itemData(parsed.data)).toMatchObject({ unit: "pair", lowStockThreshold: 1 });
    expect(itemOpening(parsed.data).initialQuantity).toBe(3);
  });

  it("refuses an empty open container, a missing kind and a page that is not http(s)", () => {
    expect(
      itemInputSchema.safeParse({ ...common, kind: "product", containers: 1, level: "empty" })
        .success,
    ).toBe(false);
    expect(itemInputSchema.safeParse({ ...common }).success).toBe(false);
    const link = { shopName: null, url: "javascript:alert(1)", priceCents: null };
    expect(itemInputSchema.safeParse({ ...common, kind: "tool", owned: true, link }).success).toBe(
      false,
    );
  });
});
