import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { computeContentHash } from "@brains/utils/hash";
import { YAMLLoader } from "../src/loaders/yaml-loader";
import { evaluateCriteria } from "../src/criteria-evaluator";

const cases = join(
  import.meta.dir,
  "../../../packages/brain-cli/test-cases/personal/multi-turn",
);
const loader = YAMLLoader.createFresh({ directory: cases });

describe("verbatim creation MCP eval contract", () => {
  test("checks exact source bytes before approval, cancellation, and full stored content", async () => {
    const testCase = await loader.loadTestCase(
      join(cases, "mcp-verbatim-create.yaml"),
    );
    if (testCase.type !== "multi_turn")
      throw new Error("Expected multi-turn eval");
    const request = testCase.turns[0]?.userMessage;
    if (!request) throw new Error("Missing verbatim create request");
    const startAfter = "BEGIN EXACT CONTENT";
    const endBefore = "END EXACT CONTENT";
    const content = request.slice(
      request.indexOf(`${startAfter}\n`) + startAfter.length + 1,
      request.lastIndexOf(endBefore),
    );
    expect(Buffer.byteLength(content)).toBe(17_000);
    expect(content).toContain("Hard break\\\n");
    expect(content).toContain("Literal pair\\\\\n");
    expect(content).toContain("replacement: $&");
    expect(testCase.turns[3]?.userMessage).toBe(request);
    expect(testCase.tags).toContain("mcp-protocol");
    for (const index of [0, 3]) {
      const proposal =
        testCase.turns[index]?.successCriteria?.expectedTools?.[0];
      expect(proposal?.argsContain).toMatchObject({
        visibility: "restricted",
        "source.kind": "user-message",
        "source.boundaryMode": "lines",
        "source.startAfter": startAfter,
        "source.endBefore": endBefore,
        "source.contentHash": computeContentHash(content),
      });
      expect(proposal?.argsAbsent).toContain("source.content");
      expect(proposal?.resultContains).toEqual({ needsConfirmation: true });
    }
    const proposalCriteria = testCase.turns[0]?.successCriteria;
    if (!proposalCriteria) throw new Error("Missing proposal checks");
    // A lost final newline must fail the proposal check, even though canonical
    // Markdown serialization would restore that newline on storage.
    for (const selected of [content, content.slice(0, -1)]) {
      const results = evaluateCriteria(
        proposalCriteria,
        { text: "Create note?" },
        [
          {
            toolName: "system_create",
            args: {
              entityType: "note",
              title: "MCP verbatim create",
              visibility: "restricted",
              source: {
                kind: "user-message",
                boundaryMode: "lines",
                startAfter,
                endBefore,
                contentHash: computeContentHash(selected),
              },
            },
            result: { needsConfirmation: true },
          },
        ],
      );
      expect(results.every((result) => result.passed)).toBe(
        selected === content,
      );
    }
    expect(testCase.turns[1]?.confirmPendingAction).toBe(false);
    expect(
      testCase.turns[2]?.successCriteria?.expectedTools?.[0]
        ?.resultErrorContains,
    ).toBe("not found: note/mcp-verbatim-create");
    expect(testCase.turns[4]?.confirmPendingAction).toBe(true);
    const criteria = testCase.turns[5]?.successCriteria;
    if (!criteria) throw new Error("Missing saved content checks");
    const canonicalContent = `---\nvisibility: restricted\n---\n${content}`;
    expect(
      criteria.expectedTools?.[0]?.resultContains?.["entity.content"],
    ).toBe(canonicalContent);

    for (const storedContent of [
      canonicalContent,
      canonicalContent.slice(0, -458),
      canonicalContent + "END EXACT CONTENT",
      canonicalContent.replaceAll("\\", "\\\\"),
    ]) {
      const results = evaluateCriteria(criteria, { text: "Saved exactly." }, [
        {
          toolName: "system_get",
          args: { entityType: "note", id: "mcp-verbatim-create" },
          result: {
            entity: {
              content: storedContent,
              visibility: "restricted",
              metadata: { title: "MCP verbatim create" },
            },
          },
        },
      ]);
      expect(results.every((result) => result.passed)).toBe(
        storedContent === canonicalContent,
      );
    }
  });
});
