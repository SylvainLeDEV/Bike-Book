import { describe, expect, it } from "vitest";
import { NBSP, NNBSP } from "./format";
import { decimalText, parseDecimalInput, parseMoneyInput } from "./parse";

describe("parseDecimalInput", () => {
  it("reads French and plain numbers", () => {
    expect(parseDecimalInput("15,2")).toBe(15.2);
    expect(parseDecimalInput("15.2")).toBe(15.2);
    expect(parseDecimalInput(`4${NNBSP}299,00`)).toBe(4299);
    expect(parseDecimalInput(`1${NBSP}234 567`)).toBe(1_234_567);
    expect(parseDecimalInput(" 0 ")).toBe(0);
  });

  it("returns null when empty and NaN when not a number", () => {
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("   ")).toBeNull();
    expect(parseDecimalInput("abc")).toBeNaN();
    expect(parseDecimalInput("-3")).toBeNaN();
    expect(parseDecimalInput("1,2,3")).toBeNaN();
    expect(parseDecimalInput("1e3")).toBeNaN();
  });
});

describe("parseMoneyInput", () => {
  it("converts euros to cents without float drift", () => {
    expect(parseMoneyInput(`4${NNBSP}299,00`)).toBe(429_900);
    expect(parseMoneyInput("19,99")).toBe(1999);
    expect(parseMoneyInput("0,1")).toBe(10);
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("x")).toBeNaN();
  });
});

describe("decimalText", () => {
  it("keeps only the decimals that matter", () => {
    expect(decimalText(15.2, 3)).toBe("15,2");
    expect(decimalText(15, 3)).toBe("15");
    expect(decimalText(1500, 1)).toBe(`1${NNBSP}500`);
    expect(decimalText(0.25, 2)).toBe("0,25");
    expect(decimalText(100, 0)).toBe("100");
    expect(decimalText(100, 2)).toBe("100");
  });
});
