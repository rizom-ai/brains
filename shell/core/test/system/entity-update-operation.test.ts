import { describe, expect, it } from "bun:test";
import { fieldPersists } from "../../src/system/entity-update-operation";

describe("fieldPersists", () => {
  it("keeps a requested value only when the store holds an equal one", () => {
    expect(fieldPersists({ tags: ["a", "b"] }, "tags", ["a", "b"])).toBe(true);
    expect(fieldPersists({ tags: ["a"] }, "tags", ["a", "b"])).toBe(false);
    expect(fieldPersists({}, "tags", ["a", "b"])).toBe(false);
  });

  it("treats a requested null as removal, which only an absent key honours", () => {
    expect(fieldPersists({}, "summary", null)).toBe(true);
    expect(fieldPersists({ summary: null }, "summary", null)).toBe(false);
    expect(fieldPersists({ summary: "kept" }, "summary", null)).toBe(false);
  });
});
