import { describe, expect, it } from "bun:test";
import { seededRandom } from "../src/seeded-random";

describe("seededRandom", () => {
  it("gives the same sequence for the same seed", () => {
    const first = seededRandom(211);
    const second = seededRandom(211);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });

  it("gives another sequence for another seed", () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });

  it("stays within zero, inclusive, and one, exclusive", () => {
    const random = seededRandom(7331);
    const values = Array.from({ length: 200 }, () => random());
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it("keeps the sequence a layout was drawn from", () => {
    expect(seededRandom(133)()).toBe(0.5741821194533259);
  });
});
