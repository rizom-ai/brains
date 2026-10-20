import { describe, expect, it } from "bun:test";
import { sharpened, unjoined } from "../src/adapters/run-together";

const common = new Set(
  "er war eine da ich meinen linken arm gebrochen hatte wie sagt des wiederum die daß mußte großen riß mc mi kultur diese affekt verwandlung regression sein wird bei der".split(
    " ",
  ),
);

describe("unjoined", () => {
  it("parts words the OCR ran together in letter-spaced type, at the capital inside", () => {
    expect(
      unjoined(
        "Er war eineZeitlang krank, daichmeinenlinkenArmgebrochen hatte.",
        common,
      ),
    ).toBe(
      "Er war eine Zeitlang krank, da ich meinen linken Armgebrochen hatte.",
    );
  });

  it("parts the words after the last capital only where three or more make a phrase, not a compound", () => {
    expect(
      unjoined(
        "dieseAffektverwandlung, wirdbeiderRegressioninsein, daichmeinenlinkenArmgebrochen",
        common,
      ),
    ).toBe(
      "diese Affektverwandlung, wird bei der Regression in sein, da ich meinen linken Armgebrochen",
    );
  });

  it("parts only where the words before the capital are the text's common words", () => {
    expect(
      unjoined(
        "wiederumdieZugehörigkeit des Ichs, desIchs, wie MacCulloch sagt",
        common,
      ),
    ).toBe(
      "wiederum die Zugehörigkeit des Ichs, des Ichs, wie MacCulloch sagt",
    );
  });

  it("leaves a word without a capital inside as it is", () => {
    expect(unjoined("Wiederholungszwang und groBen", common)).toBe(
      "Wiederholungszwang und groBen",
    );
  });
});

describe("unjoined, short runs", () => {
  it("parts no run of fewer than five letters, an abbreviation as often as not", () => {
    expect(unjoined("die PsA lehrt", common)).toBe("die PsA lehrt");
  });

  it("parts off no two letters but a German word's, so a name stays whole", () => {
    expect(unjoined("McDougall und MiBlingen", common)).toBe(
      "McDougall und MiBlingen",
    );
  });
});

describe("sharpened", () => {
  it("reads a B the OCR made of ß as ß, where the text knows the word so", () => {
    expect(
      sharpened("daB er muBte, die groBen Fragen, ein rißB im Bau", common),
    ).toBe("daß er mußte, die großen Fragen, ein riß im Bau");
  });

  it("reads a ß the OCR read twice once, whatever the word", () => {
    expect(sharpened("im KulturprozeßB und", common)).toBe(
      "im Kulturprozeß und",
    );
  });

  it("leaves a B the text does not know as ß", () => {
    expect(sharpened("der HauptBahnhof und groBartig", common)).toBe(
      "der HauptBahnhof und groBartig",
    );
  });
});
