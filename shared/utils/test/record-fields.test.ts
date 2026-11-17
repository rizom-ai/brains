import { describe, it, expect } from "bun:test";
import {
  asRecord,
  readBoolean,
  readNumber,
  readString,
  readValue,
} from "../src/record-fields";

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

describe("readBoolean", () => {
  it("returns booleans only", () => {
    expect(readBoolean({ ok: false }, "ok")).toBe(false);
    expect(readBoolean({ ok: true }, "ok")).toBe(true);
    expect(readBoolean({ ok: "true" }, "ok")).toBeUndefined();
    expect(readBoolean(undefined, "ok")).toBeUndefined();
  });
});

describe("a bag of unknown shape", () => {
  it("reads a field from a plain object", () => {
    const payload: unknown = { title: "A note", size: 3, nested: { id: "n" } };
    expect(readString(payload, "title")).toBe("A note");
    expect(readNumber(payload, "size")).toBe(3);
    expect(readValue(payload, "nested")).toEqual({ id: "n" });
    expect(asRecord(payload)).toEqual({
      title: "A note",
      size: 3,
      nested: { id: "n" },
    });
  });

  it("reads nothing from what is not a plain object", () => {
    expect(readString("title", "length")).toBeUndefined();
    expect(readNumber(["a"], "length")).toBeUndefined();
    expect(readValue(new Date(0), "getTime")).toBeUndefined();
    expect(asRecord(["a"])).toBeUndefined();
    expect(asRecord(null)).toBeUndefined();
  });
});
