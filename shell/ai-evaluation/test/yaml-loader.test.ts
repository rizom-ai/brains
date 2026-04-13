import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { YAMLLoader } from "../src/loaders/yaml-loader";

describe("YAMLLoader", () => {
  it("loads the base/note mapping eval", async () => {
    const filePath = join(
      import.meta.dir,
      "..",
      "evals",
      "test-cases",
      "tool-invocation",
      "base-note-mapping.yaml",
    );

    const loader = YAMLLoader.createFresh({ directory: import.meta.dir });
    const testCase = await loader.loadTestCase(filePath);

    expect(testCase.id).toBe("shell-base-note-mapping");
    expect(testCase.type).toBe("multi_turn");
    if (testCase.type === "plugin") {
      throw new Error("Expected an agent test case");
    }
    expect(testCase.turns).toHaveLength(3);
    expect(testCase.turns[0]?.successCriteria?.expectedTools?.[0]).toEqual({
      toolName: "system_create",
      shouldBeCalled: true,
      argsContain: { entityType: "base" },
    });
    expect(testCase.turns[2]?.userMessage).toContain(
      'User uploaded a file "meeting-notes.md":',
    );
  });
});
