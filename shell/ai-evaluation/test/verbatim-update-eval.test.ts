import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { computeContentHash } from "@brains/utils/hash";
import { YAMLLoader } from "../src/loaders/yaml-loader";
import { evaluateCriteria } from "../src/criteria-evaluator";

const cli = join(import.meta.dir, "../../../packages/brain-cli");
const cases = join(cli, "test-cases/personal/multi-turn");
const loader = YAMLLoader.createFresh({ directory: cases });
const id = "mcp-verbatim-update";
const frontmatter = "---\nvisibility: restricted\n---\n";

describe("verbatim update MCP eval contract", () => {
  test("checks the pinned source, cancelled state, and body replaced under stored frontmatter", async () => {
    const testCase = await loader.loadTestCase(join(cases, `${id}.yaml`));
    if (testCase.type !== "multi_turn")
      throw new Error("Expected multi-turn eval");
    const original = await readFile(
      join(cli, `eval-content/recipes/personal/${id}.md`),
      "utf8",
    );
    // The fixture keeps Prettier's blank line after frontmatter; the seeded
    // entity stores canonical Markdown without it.
    expect(original.startsWith(`${frontmatter}\n`)).toBe(true);
    const stored = original.replace(`${frontmatter}\n`, frontmatter);
    const request = testCase.turns[0]?.userMessage;
    if (!request) throw new Error("Missing verbatim update request");
    const startAfter = "BEGIN EXACT CONTENT";
    const endBefore = "END EXACT CONTENT";
    const content = request.slice(
      request.indexOf(`${startAfter}\n`) + startAfter.length + 1,
      request.lastIndexOf(endBefore),
    );
    expect(Buffer.byteLength(content)).toBe(7_000);
    expect(content).toContain("Hard break\\\n");
    expect(content).toContain("Literal pair\\\\\n");
    expect(content).toContain("replacement: $&");
    expect(content).not.toContain("visibility:");
    expect(testCase.turns[3]?.userMessage).toBe(request);
    expect(testCase.tags).toContain("mcp-protocol");
    expect(testCase.tags).toContain("verbatim-update");

    for (const index of [0, 3]) {
      const proposal =
        testCase.turns[index]?.successCriteria?.expectedTools?.[0];
      expect(proposal?.toolName).toBe("system_update");
      expect(proposal?.argsContain).toEqual({
        entityType: "note",
        id,
        "operation.kind": "source",
        "operation.source.kind": "user-message",
        "operation.source.boundaryMode": "lines",
        "operation.source.startAfter": startAfter,
        "operation.source.endBefore": endBefore,
        "operation.source.contentHash": computeContentHash(content),
      });
      for (const absent of [
        "operation.content",
        "operation.edits",
        "operation.fields",
        "confirmed",
      ])
        expect(proposal?.argsAbsent).toContain(absent);
      expect(proposal?.resultContains).toEqual({ needsConfirmation: true });
    }

    expect(testCase.turns[1]?.confirmPendingAction).toBe(false);
    // Read-backs check the stored record, whichever part the model reads.
    expect(
      testCase.turns[2]?.successCriteria?.expectedTools?.[0]?.resultContains,
    ).toEqual({
      "entity.contentHash": computeContentHash(stored),
      "entity.visibility": "restricted",
    });
    expect(testCase.turns[4]?.confirmPendingAction).toBe(true);
    expect(
      testCase.turns[4]?.successCriteria?.expectedTools?.[0]?.resultContains,
    ).toEqual({ success: true, "data.updated": id });

    const criteria = testCase.turns[5]?.successCriteria;
    if (!criteria) throw new Error("Missing saved content checks");
    const expected = `${frontmatter}${content}`;
    expect(criteria.expectedTools?.[0]?.resultContains).toEqual({
      "entity.contentHash": computeContentHash(expected),
      "entity.visibility": "restricted",
    });
    // Dropped frontmatter, an unapplied update, or regenerated backslashes
    // must each fail the saved-state check.
    for (const candidate of [
      expected,
      content,
      stored,
      expected.replaceAll("\\", "\\\\"),
    ]) {
      const results = evaluateCriteria(criteria, { text: "Updated." }, [
        {
          toolName: "system_get",
          args: { entityType: "note", id },
          result: {
            entity: {
              contentHash: computeContentHash(candidate),
              visibility: "restricted",
            },
          },
        },
      ]);
      expect(results.every((result) => result.passed)).toBe(
        candidate === expected,
      );
    }
  });
});
