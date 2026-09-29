import { describe, expect, it } from "bun:test";
import { evaluateCriteria } from "../src/criteria-evaluator";
import { successCriteriaSchema } from "../src/schemas/test-case";
import type { ToolCallRecord } from "../src/schemas";

const content = "# Note\nHard break\\\nLiteral pair\\\\\n";
const criteria = successCriteriaSchema.parse({
  expectedTools: [
    {
      toolName: "system_get",
      argsContain: { entityType: "note", id: "target" },
      resultContains: {
        "entity.content": content,
        "entity.metadata.title": "Note",
      },
    },
  ],
});

function evaluate(calls: ToolCallRecord[]): boolean {
  return evaluateCriteria(criteria, { text: "Saved correctly." }, calls).every(
    (result) => result.passed,
  );
}

function readResult(body: string, title = "Note"): ToolCallRecord {
  return {
    toolName: "system_get",
    args: { entityType: "note", id: "target" },
    result: { entity: { content: body, metadata: { title } } },
  };
}

describe("exact tool result criteria", () => {
  it("retains resultContains when loading the criteria schema", () => {
    expect(criteria.expectedTools?.[0]?.resultContains).toEqual({
      "entity.content": content,
      "entity.metadata.title": "Note",
    });
  });

  it("passes an exact persisted content and title match", () => {
    expect(evaluate([readResult(content)])).toBe(true);
  });

  it.each([
    content.replaceAll("\\", "\\\\"),
    content.trimEnd(),
    content.replace("Hard break", "Unrequested rewrite"),
  ])("fails changed bytes despite a success claim: %j", (changed) => {
    expect(evaluate([readResult(changed)])).toBe(false);
  });

  it("does not combine body and title from different results", () => {
    expect(
      evaluate([
        readResult(content, "Old title"),
        readResult("Old body", "Note"),
      ]),
    ).toBe(false);
  });

  it("does not ignore an incorrect result when another read matches", () => {
    expect(evaluate([readResult(content), readResult("Old body")])).toBe(false);
  });

  it("scopes results to the entity selected by argsContain", () => {
    const other = {
      ...readResult("Other content"),
      args: { entityType: "note", id: "other" },
    };
    expect(evaluate([other, readResult(content)])).toBe(true);
    expect(evaluate([other, readResult("Old body")])).toBe(false);
    expect(evaluate([other])).toBe(false);
  });

  it.each([undefined, null, { success: false, error: "Not found" }])(
    "fails missing or refused results: %j",
    (result) => {
      expect(evaluate([{ ...readResult(content), result }])).toBe(false);
    },
  );
});
