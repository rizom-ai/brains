import { describe, it, expect } from "bun:test";
import { readString, readNumber } from "../src/record-fields";

describe("readString", () => {
  it("returns the value when it is a string", () => {
    expect(readString({ slug: "a-post" }, "slug")).toBe("a-post");
    expect(readString({ slug: "" }, "slug")).toBe("");
  });

  it("returns undefined for a missing key", () => {
    expect(readString({}, "slug")).toBeUndefined();
  });

  it("returns undefined when the value is not a string", () => {
    expect(readString({ slug: 1 }, "slug")).toBeUndefined();
    expect(readString({ slug: null }, "slug")).toBeUndefined();
    expect(readString({ slug: undefined }, "slug")).toBeUndefined();
    expect(readString({ slug: ["a"] }, "slug")).toBeUndefined();
  });

  it("accepts an absent bag", () => {
    expect(readString(undefined, "slug")).toBeUndefined();
    expect(readString(null, "slug")).toBeUndefined();
  });
});

describe("readNumber", () => {
  it("returns finite numbers only", () => {
    expect(readNumber({ n: 3 }, "n")).toBe(3);
    expect(readNumber({ n: 0 }, "n")).toBe(0);
    expect(readNumber({ n: Number.NaN }, "n")).toBeUndefined();
    expect(readNumber({ n: Infinity }, "n")).toBeUndefined();
  });

  it("returns undefined for non-numbers and absent bags", () => {
    expect(readNumber({ n: "3" }, "n")).toBeUndefined();
    expect(readNumber({}, "n")).toBeUndefined();
    expect(readNumber(undefined, "n")).toBeUndefined();
    expect(readNumber(null, "n")).toBeUndefined();
  });
});
