import { describe, expect, it } from "bun:test";
import { addDuplicateIssues } from "../src/operator/operator-schema-refinements";

function collector(): {
  readonly issues: unknown[];
  readonly context: { addIssue: (issue: unknown) => void };
} {
  const issues: unknown[] = [];
  return { issues, context: { addIssue: (issue) => issues.push(issue) } };
}

describe("addDuplicateIssues", () => {
  it("reports every repeat after the first at the item's key path", () => {
    const { issues, context } = collector();

    addDuplicateIssues(
      context,
      [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "a" }],
      (item) => item.id,
      { label: "List item id", path: ["items", "id"] },
    );

    expect(issues).toEqual([
      {
        code: "custom",
        message: 'List item id "a" is duplicated',
        path: ["items", 2, "id"],
      },
      {
        code: "custom",
        message: 'List item id "a" is duplicated',
        path: ["items", 3, "id"],
      },
    ]);
  });

  it("returns every key it saw", () => {
    const { issues, context } = collector();

    const keys = addDuplicateIssues(
      context,
      [{ key: "title" }, { key: "status" }],
      (column) => column.key,
      { label: "Table column key", path: ["columns", "key"] },
    );

    expect(issues).toEqual([]);
    expect([...keys]).toEqual(["title", "status"]);
  });

  it("skips items without a key", () => {
    const { issues, context } = collector();

    const keys = addDuplicateIssues(
      context,
      [{ id: undefined }, { id: "x" }, { id: undefined }],
      (block) => block.id,
      { label: "Operator view block id", path: ["blocks", "id"] },
    );

    expect(issues).toEqual([]);
    expect([...keys]).toEqual(["x"]);
  });

  it("counts reserved keys as taken but returns only the collection's own keys", () => {
    const { issues, context } = collector();

    const keys = addDuplicateIssues(
      context,
      [{ id: "zone" }, { id: "point" }],
      (zone) => zone.id,
      {
        label: "Spatial zone id",
        path: ["zones", "id"],
        reserved: new Set(["point", "elsewhere"]),
      },
    );

    expect(issues).toEqual([
      {
        code: "custom",
        message: 'Spatial zone id "point" is duplicated',
        path: ["zones", 1, "id"],
      },
    ]);
    expect([...keys]).toEqual(["zone", "point"]);
  });

  it("visits each item after its own check, so item issues stay in source order", () => {
    const { issues, context } = collector();

    addDuplicateIssues(context, [{ id: "r" }, { id: "r" }], (row) => row.id, {
      label: "Table row id",
      path: ["rows", "id"],
      each: (row, index) => context.addIssue(`visited ${row.id}@${index}`),
    });

    expect(issues).toEqual([
      "visited r@0",
      {
        code: "custom",
        message: 'Table row id "r" is duplicated',
        path: ["rows", 1, "id"],
      },
      "visited r@1",
    ]);
  });
});
