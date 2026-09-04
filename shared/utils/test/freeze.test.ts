import { describe, it, expect } from "bun:test";
import { freeze } from "../src/freeze";

describe("freeze", () => {
  it("freezes the value at runtime", () => {
    const value = freeze({ a: 1 });
    expect(Object.isFrozen(value)).toBe(true);
  });

  it("returns the same reference", () => {
    const source = { a: 1 };
    expect(freeze(source)).toBe(source);
  });

  it("keeps the declared type rather than widening to Readonly", () => {
    interface Settings {
      name: string;
      count: number;
    }
    const settings: Settings = freeze({ name: "a", count: 1 });
    expect(settings.name).toBe("a");
  });

  it("freezes arrays", () => {
    const list = freeze([1, 2, 3]);
    expect(Object.isFrozen(list)).toBe(true);
  });

  it("passes primitives through unchanged", () => {
    expect(freeze(1)).toBe(1);
    expect(freeze("a")).toBe("a");
    expect(freeze(null)).toBeNull();
  });
});
