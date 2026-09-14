import { describe, expect, test } from "bun:test";
import {
  decodeEntityIdPath,
  encodeEntityIdPath,
  entityIdPathSchema,
} from "../src/entity-id-path";

describe("entity ID paths", () => {
  test("round-trips structured paths through stored IDs", () => {
    const path = ["book-1", "part-1", "chapter-2"] as const;

    const id = encodeEntityIdPath(path);

    expect(id).toBe("book-1:part-1:chapter-2");
    expect(decodeEntityIdPath(id)).toEqual([...path]);
  });

  test("preserves Unicode segments", () => {
    const path = ["日本語", "café", "第1章"] as const;

    expect(decodeEntityIdPath(encodeEntityIdPath(path))).toEqual([...path]);
  });

  test.each([
    { path: [] },
    { path: [""] },
    { path: ["."] },
    { path: [".."] },
    { path: ["part:one"] },
    { path: ["part/one"] },
    { path: ["part\\one"] },
    { path: ["part\0one"] },
  ])("rejects unsafe path %#", ({ path }) => {
    expect(entityIdPathSchema.safeParse(path).success).toBe(false);
  });

  test("rejects malformed stored IDs", () => {
    expect(() => decodeEntityIdPath("book::chapter")).toThrow();
    expect(() => decodeEntityIdPath("book:../chapter")).toThrow();
  });
});
