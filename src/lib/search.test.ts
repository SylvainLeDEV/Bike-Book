import { describe, expect, it } from "vitest";
import { foldText, matchesWords, searchWords } from "./search";

describe("text search (D-112)", () => {
  it("folds case and accents", () => {
    expect(foldText("Chaîne Étrier ÇA")).toBe("chaine etrier ca");
    expect(searchWords("  Chaîne   GRIZL ")).toEqual(["chaine", "grizl"]);
    expect(searchWords("   ")).toEqual([]);
  });

  it("finds every word at the start of a word, in any order", () => {
    const text = "Remplacement de la chaîne · Gravel - Grizl · Quick-Link 12v";
    expect(matchesWords(text, searchWords("grizl chaine"))).toBe(true);
    expect(matchesWords(text, searchWords("chain"))).toBe(true);
    expect(matchesWords(text, searchWords("link"))).toBe(true);
    expect(matchesWords(text, searchWords("12"))).toBe(true);
    expect(matchesWords(text, searchWords("quick-link"))).toBe(true);
    // Inside a word is no match: "lac" is not in "remplacement".
    expect(matchesWords(text, searchWords("lac"))).toBe(false);
    expect(matchesWords(text, searchWords("chaine spectral"))).toBe(false);
    expect(matchesWords(text, [])).toBe(true);
  });
});
