import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header and one CRLF line per row", () => {
    expect(
      toCsv(
        ["id", "name"],
        [
          [1, "Spectral"],
          [2, "Le Lourd"],
        ],
      ),
    ).toBe("id,name\r\n1,Spectral\r\n2,Le Lourd\r\n");
  });

  it("quotes commas, quotes, line breaks and edge spaces", () => {
    expect(toCsv(["notes"], [["a, b"], ['dit "purge"'], ["ligne 1\nligne 2"], [" espace"]])).toBe(
      'notes\r\n"a, b"\r\n"dit ""purge"""\r\n"ligne 1\nligne 2"\r\n" espace"\r\n',
    );
  });

  it("writes null as empty, booleans as words and JSON as text", () => {
    expect(toCsv(["a", "b", "c", "d"], [[null, true, false, { travel_mm: 160 }]])).toBe(
      'a,b,c,d\r\n,true,false,"{""travel_mm"":160}"\r\n',
    );
  });

  it("keeps decimals with a point and accents as they are", () => {
    expect(toCsv(["ratio", "name"], [[0.9, "Vélo élec"]])).toBe("ratio,name\r\n0.9,Vélo élec\r\n");
  });
});
