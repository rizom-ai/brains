import { describe, it, expect } from "bun:test";
import { objectKeys, objectEntries, isKeyOf } from "../src/object-keys";

const colors = { red: 1, green: 2, blue: 3 };

describe("objectKeys", () => {
  it("returns the record's own keys", () => {
    expect(objectKeys(colors).sort()).toEqual(["blue", "green", "red"]);
  });

  it("types keys so they index the record without an assertion", () => {
    const total = objectKeys(colors).reduce((sum, key) => sum + colors[key], 0);
    expect(total).toBe(6);
  });

  it("returns an empty list for an empty record", () => {
    expect(objectKeys({})).toEqual([]);
  });
});

describe("objectEntries", () => {
  it("returns key/value pairs", () => {
    expect(objectEntries(colors).sort()).toEqual([
      ["blue", 3],
      ["green", 2],
      ["red", 1],
    ]);
  });

  it("types the key so it can be reused as a record key", () => {
    const rebuilt: Record<string, number> = {};
    for (const [key, value] of objectEntries(colors)) rebuilt[key] = value;
    expect(rebuilt).toEqual(colors);
  });
});

describe("isKeyOf", () => {
  it("accepts declared keys and narrows for indexing", () => {
    const candidate: string = "red";
    if (!isKeyOf(colors, candidate)) throw new Error("expected a known key");
    expect(colors[candidate]).toBe(1);
  });

  it("rejects unknown keys", () => {
    expect(isKeyOf(colors, "purple")).toBe(false);
  });

  it("reflects runtime presence, not the declared type", () => {
    const extra: Record<string, number> = { ...colors, purple: 4 };
    expect(isKeyOf(extra, "purple")).toBe(true);
  });
});
