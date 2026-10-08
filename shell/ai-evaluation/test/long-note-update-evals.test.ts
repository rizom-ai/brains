import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { YAMLLoader } from "../src/loaders/yaml-loader";
import type { AgentTestCase } from "../src/schemas";
import { evaluateCriteria } from "../src/criteria-evaluator";

const cli = join(import.meta.dir, "../../../packages/brain-cli");
const cases = join(cli, "test-cases/personal/multi-turn");
const loader = YAMLLoader.createFresh({ directory: cases });

async function load(id: string): Promise<AgentTestCase> {
  const testCase = await loader.loadTestCase(join(cases, `${id}.yaml`));
  if (testCase.type !== "multi_turn")
    throw new Error("Expected multi-turn eval");
  return testCase;
}

function changedContent(original: string, combined: boolean): string {
  const edited = original.replace(
    "Review cadence: monthly.",
    "Review cadence: weekly.",
  );
  return combined
    ? edited.replace("# Working Plan", "# Approved Plan")
    : edited;
}

describe("long-note agent eval coverage", () => {
  it("checks the MCP contract without requiring internal reads in confirmation responses", async () => {
    const id = "mcp-long-note-update";
    const testCase = await load(id);
    const original = await readFile(
      join(cli, `eval-content/recipes/personal/${id}.md`),
      "utf8",
    );
    expect(Buffer.byteLength(original)).toBe(17_000);
    expect(testCase.tags).toContain("mcp-protocol");
    const expected = changedContent(original, true);
    for (const index of [0, 3]) {
      const criteria = testCase.turns[index]?.successCriteria;
      expect(criteria?.expectedTools?.map((tool) => tool.toolName)).toEqual([
        "system_update",
      ]);
      expect(criteria?.expectedTools?.[0]?.argsContain).toEqual({
        entityType: "note",
        id,
        operation: {
          kind: "edits",
          edits: [
            { oldText: "# Working Plan", newText: "# Approved Plan" },
            {
              oldText: "Review cadence: monthly.",
              newText: "Review cadence: weekly.",
            },
          ],
        },
      });
      expect(criteria?.expectedTools?.[0]?.resultContains).toEqual({
        needsConfirmation: true,
      });
      expect(criteria?.responseContains).toBeUndefined();
    }
    expect(testCase.turns[1]?.confirmPendingAction).toBe(false);
    expect(testCase.turns[4]?.confirmPendingAction).toBe(true);
    expect(
      testCase.turns[2]?.successCriteria?.expectedTools?.[0]?.resultContains?.[
        "entity.content"
      ],
    ).toBe(original);
    expect(
      testCase.turns[5]?.successCriteria?.expectedTools?.[0]?.resultContains,
    ).toEqual({
      "entity.content": expected,
      "entity.metadata.title": "Approved Plan",
    });
    // Approval checks the executed operation and storage result, not a success phrase.
    expect(
      testCase.turns[4]?.successCriteria?.expectedTools?.[0]?.resultContains,
    ).toEqual({ success: true, "data.updated": id });
  });

  it.each([
    { id: "long-note-update-7kb", bytes: 7_000 },
    { id: "long-note-update-14kb", bytes: 14_000 },
    { id: "long-note-update-17kb", bytes: 17_000 },
    { id: "long-note-update-title-and-body", bytes: 1_000 },
  ])(
    "checks exact proposals, cancelled state, and saved state: $id",
    async ({ id, bytes }) => {
      const testCase = await load(id);
      const original = await readFile(
        join(cli, `eval-content/recipes/personal/${id}.md`),
        "utf8",
      );
      const combined = id.endsWith("title-and-body");
      const expected = changedContent(original, combined);
      expect(Buffer.byteLength(original)).toBe(bytes);
      expect(original).toContain("Hard break\\\n");
      expect(original).toContain("Literal pair\\\\\n");
      expect(expected).not.toBe(original);
      expect(testCase.tags).toContain("recipe-personal");
      expect(testCase.tags).toContain("long-note-update");
      expect(testCase.efficiency?.maxDurationMs).toBeUndefined();
      expect(testCase.turns).toHaveLength(6);
      expect(testCase.turns[1]?.confirmPendingAction).toBe(false);
      expect(testCase.turns[4]?.confirmPendingAction).toBe(true);
      // Confirmed-action results retain the ToolResponse envelope, unlike
      // normal agent read results, which expose the data directly.
      expect(
        testCase.turns[4]?.successCriteria?.expectedTools?.[0]?.resultContains,
      ).toEqual({ success: true, "data.updated": id });
      for (const index of [0, 3]) {
        const proposal = testCase.turns[
          index
        ]?.successCriteria?.expectedTools?.find(
          (tool) => tool.toolName === "system_update",
        );
        expect(proposal?.argsContain).toMatchObject({
          entityType: "note",
          id,
          operation: {
            kind: "edits",
            edits: [
              ...(combined
                ? [{ oldText: "# Working Plan", newText: "# Approved Plan" }]
                : []),
              {
                oldText: "Review cadence: monthly.",
                newText: "Review cadence: weekly.",
              },
            ],
          },
        });
        expect(proposal?.argsAbsent).toContain("operation.fields");
        expect(proposal?.argsAbsent).toContain("operation.content");
        expect(proposal?.resultContains).toEqual({ needsConfirmation: true });
      }
      const cancelledRead =
        testCase.turns[2]?.successCriteria?.expectedTools?.find(
          (tool) => tool.toolName === "system_get",
        );
      const savedRead = testCase.turns[5]?.successCriteria?.expectedTools?.find(
        (tool) => tool.toolName === "system_get",
      );
      expect(cancelledRead?.resultContains?.["entity.content"]).toBe(original);
      expect(savedRead?.resultContains?.["entity.content"]).toBe(expected);
      if (combined)
        expect(savedRead?.resultContains?.["entity.metadata.title"]).toBe(
          "Approved Plan",
        );

      // A changed backslash or a lost edit must make the actual eval fail, even
      // when the assistant claims success and invokes the expected read tool.
      const criteria = testCase.turns[5]?.successCriteria;
      if (!criteria) throw new Error("Missing saved-state criteria");
      for (const corrupt of [original, expected.replaceAll("\\", "\\\\")]) {
        const results = evaluateCriteria(
          criteria,
          { text: "Saved correctly." },
          [
            {
              toolName: "system_get",
              args: { entityType: "note", id },
              result: {
                entity: {
                  content: corrupt,
                  metadata: {
                    title: combined ? "Approved Plan" : "Working Plan",
                  },
                },
              },
            },
          ],
        );
        expect(results.some((result) => !result.passed)).toBe(true);
      }
    },
  );
});
