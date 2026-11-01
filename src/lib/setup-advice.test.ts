import { describe, expect, it } from "vitest";
import { adviceFor, sagHowTo, sagTargetOf } from "./setup-advice";

const topics = (rows: ReturnType<typeof adviceFor>) => rows.map((row) => row.topic);

describe("setup advice", () => {
  it("takes the sag targets of the FOX guides", () => {
    expect(sagTargetOf("fork", "air")).toMatchObject({ minPercent: 15, maxPercent: 20 });
    expect(sagTargetOf("rear_shock", "air")).toMatchObject({ minPercent: 25, maxPercent: 30 });
    expect(sagTargetOf("rear_shock", "coil")).toMatchObject({ minPercent: 30, maxPercent: 30 });
  });

  it("shows only the rows of the part's adjusters and spring", () => {
    expect(
      topics(adviceFor("fork", "air", ["low_speed_rebound", "low_speed_compression"])),
    ).toEqual(["SAG", "Rebond", "LSC", "Tokens"]);
    expect(topics(adviceFor("fork", "air", null))).toEqual([
      "SAG",
      "Rebond",
      "LSC",
      "HSC",
      "Tokens",
    ]);
    const coil = adviceFor("rear_shock", "coil", ["low_speed_rebound"]);
    expect(topics(coil)).toEqual(["SAG", "Rebond"]);
    expect(coil[0].lines.map((line) => line.then)).toContain("ressort plus dur");
  });

  it("says how to measure the sag, LSC open on a fork", () => {
    expect(sagHowTo("fork")[0]).toContain("LSC");
    expect(sagHowTo("rear_shock").join(" ")).not.toContain("LSC");
  });
});
