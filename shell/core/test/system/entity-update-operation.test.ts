import { describe, expect, it } from "bun:test";
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

  it("lists the changed lines of a long replacement however slow the machine", () => {
    const content = `# Working plan\n\n${lines("- step", 300)}\n`;
    const diff = buildUpdateDiff(
      note("# Working plan\n\nOld body.\n"),
      { content },
      entityRegistry,
    );

    expect(diff).toContain("- Old body.");
    expect(diff).toContain("+ - step 0");
    expect(diff).toContain("+ - step 299");
  });

  it("omits the line diff only past a fixed number of changed lines", () => {
    const diff = buildUpdateDiff(
      note(lines("old", 3_000)),
      { content: lines("new", 3_000) },
      entityRegistry,
    );

    expect(diff).toBe(
      "Full content replacement (line diff omitted: more than 400 changed lines).",
    );
  });
});
