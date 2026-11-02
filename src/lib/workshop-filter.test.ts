import { describe, expect, it } from "vitest";
import { kindTab, parseWorkshopView, writeWorkshopView } from "./workshop-filter";

describe("workshop view in the address (D-85)", () => {
  it("reads the tab, bike, search and item, ignoring what is invalid", () => {
    expect(parseWorkshopView({ tab: "tools", bike: "2", q: "clé", item: "12" })).toEqual({
      tab: "tools",
      bikeId: 2,
      query: "clé",
      itemId: 12,
      procedureId: null,
      newProcedure: false,
    });
    expect(parseWorkshopView({ tab: "nope", bike: "-1", item: "1.5" })).toEqual({
      tab: null,
      bikeId: null,
      query: "",
      itemId: null,
      procedureId: null,
      newProcedure: false,
    });
    expect(parseWorkshopView({ tab: "procedures", procedure: "4", new: "1" })).toMatchObject({
      tab: "procedures",
      procedureId: 4,
      newProcedure: true,
    });
    expect(parseWorkshopView({ tab: ["rebuy", "parts"] }).tab).toBe("rebuy");
  });

  it("writes only what differs from the default, and keeps other parameters", () => {
    const params = new URLSearchParams("tab=rebuy&other=1&new=1");
    const none = { bikeId: null, query: "  ", itemId: null, procedureId: null };
    writeWorkshopView(params, { tab: "parts", ...none });
    expect(params.toString()).toBe("other=1");
    writeWorkshopView(params, {
      ...none,
      tab: "products",
      bikeId: 3,
      query: "huile 15",
      itemId: 9,
    });
    expect(params.toString()).toBe("other=1&tab=products&bike=3&q=huile+15&item=9");
    writeWorkshopView(params, { ...none, tab: "procedures", procedureId: 4 });
    expect(params.toString()).toBe("other=1&tab=procedures&procedure=4");
  });

  it("names the tab of each kind", () => {
    expect(kindTab("part")).toBe("parts");
    expect(kindTab("product")).toBe("products");
    expect(kindTab("tool")).toBe("tools");
  });
});
