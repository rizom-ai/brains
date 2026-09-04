import { describe, expect, it } from "bun:test";
import { isRecord } from "../src/is-record";

describe("isRecord", () => {
  it("accepts plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
  });

  it("rejects null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("rejects arrays", () => {
    // The array case is the reason this guard exists: `typeof [] === "object"`
    // and `[] !== null`, so a check missing this lets arrays through as records.
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
  });

  it("rejects primitives and undefined", () => {
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord("x")).toBe(false);
    expect(isRecord(0)).toBe(false);
    expect(isRecord(false)).toBe(false);
    expect(isRecord(Symbol("s"))).toBe(false);
  });

  it("narrows to an indexable type", () => {
    const value: unknown = { field: "v" };
    expect(isRecord(value) ? value["field"] : undefined).toBe("v");
  });
});
