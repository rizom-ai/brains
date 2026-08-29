import { describe, it, expect } from "bun:test";
import { clonePlainData } from "../src/clone";

describe("clonePlainData", () => {
  it("deep-copies nested records so mutation does not reach the source", () => {
    const source = { a: { b: [1, 2, { c: 3 }] } };
    const clone = clonePlainData(source);

    expect(clone).toEqual(source);
    expect(clone).not.toBe(source);
    expect(clone.a).not.toBe(source.a);
    expect(clone.a.b).not.toBe(source.a.b);

    clone.a.b = [];
    expect(source.a.b).toHaveLength(3);
  });

  it("preserves the declared type of its argument", () => {
    const source: { id: string; count: number } = { id: "x", count: 1 };
    const clone = clonePlainData(source);
    expect(clone.id).toBe("x");
    expect(clone.count).toBe(1);
  });

  it("copies arrays element-wise", () => {
    const source = [{ a: 1 }, { a: 2 }];
    const clone = clonePlainData(source);
    expect(clone).toEqual(source);
    expect(clone[0]).not.toBe(source[0]);
  });

  it("passes non-plain values through by reference", () => {
    const date = new Date(0);
    const fn = (): number => 1;
    class Thing {}
    const thing = new Thing();

    const source = { date, fn, thing };
    const clone = clonePlainData(source);

    expect(clone.date).toBe(date);
    expect(clone.fn).toBe(fn);
    expect(clone.thing).toBe(thing);
  });

  it("preserves undefined-valued keys", () => {
    const source: { a: number | undefined } = { a: undefined };
    const clone = clonePlainData(source);
    expect("a" in clone).toBe(true);
    expect(clone.a).toBeUndefined();
  });

  it("returns primitives unchanged", () => {
    expect(clonePlainData("a")).toBe("a");
    expect(clonePlainData(1)).toBe(1);
    expect(clonePlainData(null)).toBeNull();
    expect(clonePlainData(undefined)).toBeUndefined();
  });

  it("clones null-prototype records", () => {
    const source: Record<string, unknown> = Object.create(null);
    source["a"] = 1;
    const clone = clonePlainData(source);
    expect(clone["a"]).toBe(1);
    expect(clone).not.toBe(source);
  });
});
