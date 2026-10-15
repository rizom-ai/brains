import { describe, expect, it, spyOn } from "bun:test";
import type { BaseEntity } from "@brains/entity-service";
import {
  buildUpdateDiff,
  fieldPersists,
} from "../../src/system/entity-update-operation";
import { createMockSystemServices } from "./mock-services";

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

describe("buildUpdateDiff", () => {
  const { entityRegistry } = createMockSystemServices();
  const note = (content: string): BaseEntity => ({
    id: "working-plan",
    entityType: "note",
    content,
    contentHash: "hash",
    visibility: "public",
    metadata: {},
    created: "2026-10-01T00:00:00.000Z",
    updated: "2026-10-01T00:00:00.000Z",
  });
  const lines = (prefix: string, count: number): string =>
    Array.from({ length: count }, (_, i) => `${prefix} ${i}`).join("\n");
  const omitted =
    "Full content replacement (line diff omitted: more than 400 changed lines).";

  it("lists a replacement's changed lines even when the clock advances between diff steps", () => {
    const content = `# Working plan\n\n${lines("- step", 300)}\n`;
    let now = Date.now();
    const clock = spyOn(Date, "now").mockImplementation(() => (now += 1_000));
    try {
      const diff = buildUpdateDiff(
        note("# Working plan\n\nOld body.\n"),
        { content },
        entityRegistry,
      );
      expect(diff).toContain("- Old body.");
      expect(diff).toContain("+ - step 0");
      expect(diff).toContain("+ - step 299");
      expect(diff.split("\n")).toHaveLength(301);
    } finally {
      clock.mockRestore();
    }
  });

  for (const direction of ["insert", "delete"] as const) {
    it(`includes exactly 400 ${direction}ed lines and omits 401`, () => {
      for (const count of [400, 401]) {
        const content = `anchor\n${lines("changed", count)}`;
        const diff = buildUpdateDiff(
          note(direction === "insert" ? "anchor" : content),
          { content: direction === "insert" ? content : "anchor" },
          entityRegistry,
        );
        if (count === 401) expect(diff).toBe(omitted);
        else {
          expect(diff.split("\n")).toHaveLength(400);
          expect(diff).toContain(
            `${direction === "insert" ? "+" : "-"} changed 399`,
          );
        }
      }
    });
  }

  it("counts replacement removals and additions against the same edit limit", () => {
    const diff = buildUpdateDiff(
      note(lines("old", 200)),
      { content: lines("new", 200) },
      entityRegistry,
    );
    expect(diff.split("\n")).toHaveLength(400);
    expect(diff).toContain("- old 199");
    expect(diff).toContain("+ new 199");
    expect(
      buildUpdateDiff(
        note(lines("old", 201)),
        { content: lines("new", 201) },
        entityRegistry,
      ),
    ).toBe(omitted);
  });

  it("omits a completely different large document with the explicit edit limit", () => {
    expect(
      buildUpdateDiff(
        note(lines("old", 3_000)),
        { content: lines("new", 3_000) },
        entityRegistry,
      ),
    ).toBe(omitted);
  });

  it("aligns long unchanged prefixes and suffixes without counting them as edits", () => {
    const prefix = lines("prefix", 3_000);
    const suffix = lines("suffix", 3_000);
    expect(
      buildUpdateDiff(
        note(`${prefix}\nold\n${suffix}`),
        { content: `${prefix}\nnew\n${suffix}` },
        entityRegistry,
      ),
    ).toBe("- old\n+ new");
  });

  it("retains no-op and field-change preview behavior", () => {
    const entity = note("unchanged");
    expect(
      buildUpdateDiff(entity, { content: entity.content }, entityRegistry),
    ).toBe("");
    expect(
      buildUpdateDiff(
        entity,
        { fields: { title: "New title" } },
        entityRegistry,
      ),
    ).toBe("title: (empty) → New title");
    expect(entity.content).toBe("unchanged");
    expect(entity.metadata).toEqual({});
  });
});
