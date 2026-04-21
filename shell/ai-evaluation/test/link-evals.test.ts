import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { YAMLLoader } from "../src/loaders/yaml-loader";

describe("link evaluation test cases", () => {
  it("loads the link tool capture regression evals with system_create", async () => {
    const cases = [
      "tool-capture-basic.yaml",
      "tool-capture-bookmark.yaml",
      "tool-capture-no-fabrication.yaml",
      "tool-capture-unreachable.yaml",
    ];

    const loader = YAMLLoader.createFresh({ directory: import.meta.dir });

    for (const file of cases) {
      const filePath = join(
        import.meta.dir,
        "..",
        "..",
        "..",
        "entities",
        "link",
        "evals",
        "test-cases",
        file,
      );

      const testCase = await loader.loadTestCase(filePath);
      expect(testCase.type).toBe("tool_invocation");
      if (testCase.type === "plugin") {
        throw new Error("Expected an agent evaluation test case");
      }

      const expectedTool = testCase.successCriteria.expectedTools?.[0];
      expect(expectedTool?.toolName).toBe("system_create");
      if (file === "tool-capture-basic.yaml") {
        expect(expectedTool?.argsContain).toEqual({
          entityType: "link",
          url: "https://anthropic.com/research",
        });
      } else if (file === "tool-capture-bookmark.yaml") {
        expect(expectedTool?.argsContain).toEqual({
          entityType: "link",
          url: "https://github.com/anthropics/claude-code",
        });
      } else if (file === "tool-capture-unreachable.yaml") {
        expect(expectedTool?.argsContain).toEqual({
          entityType: "link",
          url: "https://this-domain-definitely-does-not-exist-12345.com/page",
        });
      } else {
        expect(expectedTool?.argsContain).toEqual({ entityType: "link" });
      }
      expect(testCase.successCriteria.responseNotContains).toContain(
        "link_capture",
      );
    }
  });
});
