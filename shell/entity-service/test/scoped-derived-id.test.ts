import { describe, expect, test } from "bun:test";
import { scopedDerivedId } from "../src/scoped-derived-id";

describe("scopedDerivedId", () => {
  test("returns the bare id at the public tier", () => {
    expect(scopedDerivedId("climate-change", "public")).toBe("climate-change");
  });

  test("suffixes the id at the shared tier", () => {
    expect(scopedDerivedId("climate-change", "shared")).toBe(
      "climate-change-shared",
    );
  });

  test("suffixes the id at the restricted tier", () => {
    expect(scopedDerivedId("climate-change", "restricted")).toBe(
      "climate-change-restricted",
    );
  });

  test("derives distinct ids for the same base across tiers", () => {
    const ids = new Set([
      scopedDerivedId("x", "public"),
      scopedDerivedId("x", "shared"),
      scopedDerivedId("x", "restricted"),
    ]);
    expect(ids.size).toBe(3);
  });
});
