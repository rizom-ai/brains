import { describe, expect, it } from "bun:test";
import { homeDate, homeSentence } from "./studio-home-model";

// Home opens on one sentence that says how much needs the person, so a
// calm day reads as calm.
describe("Home's sentence", () => {
  it("reads as calm when nothing needs the person", () => {
    expect(homeSentence({ needs: 0, drafts: 0 })).toBe("Nothing needs you.");
    expect(homeSentence({ needs: 0, drafts: 1 })).toBe(
      "Nothing needs you, and one draft is waiting.",
    );
  });

  it("counts what needs the person in words", () => {
    expect(homeSentence({ needs: 1, drafts: 0 })).toBe("One thing needs you.");
    expect(homeSentence({ needs: 3, drafts: 2 })).toBe(
      "Three things need you, and two drafts are waiting.",
    );
    expect(homeSentence({ needs: 14, drafts: 0 })).toBe("14 things need you.");
  });
});

describe("Home's date", () => {
  it("names the day the page was composed", () => {
    expect(homeDate("2026-11-26T17:03:00.000Z", "en-GB", "UTC")).toBe(
      "Thursday 26 November",
    );
  });
});
