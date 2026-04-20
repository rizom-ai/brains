import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { YAMLLoader } from "../src/loaders/yaml-loader";

describe("agent-discovery SWOT evaluation test cases", () => {
  it("loads the tuned SWOT plugin evals", async () => {
    const cases = [
      "swot-derive-basic.yaml",
      "swot-no-agent-names.yaml",
      "swot-discovered-tentative.yaml",
      "swot-avoid-duplicate-capability-loops.yaml",
    ];

    const loader = YAMLLoader.createFresh({ directory: import.meta.dir });

    for (const file of cases) {
      const filePath = join(
        import.meta.dir,
        "..",
        "..",
        "..",
        "entities",
        "agent-discovery",
        "evals",
        "test-cases",
        file,
      );

      const testCase = await loader.loadTestCase(filePath);

      expect(testCase.type).toBe("plugin");
      if (testCase.type !== "plugin") {
        throw new Error("Expected a plugin evaluation test case");
      }

      expect(testCase.plugin).toBe("agent-discovery");
      expect(testCase.handler).toBe("deriveSwot");
      expect(testCase.expectedOutput.validateEach?.[0]).toEqual({
        path: "derivedAt",
        exists: true,
      });
      expect(testCase.expectedOutput.qualityCriteria).toBeDefined();
    }
  });
});
