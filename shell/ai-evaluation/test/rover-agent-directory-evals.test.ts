import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { YAMLLoader } from "../src/loaders/yaml-loader";

describe("rover agent directory evaluation test cases", () => {
  it("loads the rover agent directory tightening evals", async () => {
    const cases = [
      "agent-call-by-name.yaml",
      "agent-call-unknown-domain.yaml",
      "agent-call-unknown-url.yaml",
      "agent-call-url-phrasing.yaml",
      "agent-call-ambiguous-name.yaml",
      "agent-call-archived.yaml",
    ];

    const loader = YAMLLoader.createFresh({ directory: import.meta.dir });

    for (const file of cases) {
      const filePath = join(
        import.meta.dir,
        "..",
        "..",
        "..",
        "brains",
        "rover",
        "test-cases",
        "tool-invocation",
        file,
      );

      const testCase = await loader.loadTestCase(filePath);
      expect(testCase.type).toBe("tool_invocation");
      if (testCase.type === "plugin") {
        throw new Error("Expected an agent evaluation test case");
      }

      if (file === "agent-call-by-name.yaml") {
        const expectedTool = testCase.successCriteria.expectedTools?.[0];
        expect(expectedTool?.toolName).toBe("a2a_call");
        expect(expectedTool?.shouldBeCalled).toBe(true);
        expect(expectedTool?.argsContain).toEqual({ agent: "yeehaa.io" });
        continue;
      }

      const expectedA2ATool = testCase.successCriteria.expectedTools?.find(
        (tool) => tool.toolName === "a2a_call",
      );
      expect(expectedA2ATool?.shouldBeCalled).toBe(false);
    }
  });
});
