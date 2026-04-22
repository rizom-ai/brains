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
      "agent-add-no-description-needed.yaml",
      "agent-add-explicit-save-no-approval-gate.yaml",
      "agent-add-existing-idempotent.yaml",
      "agent-approve.yaml",
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

      if (
        file === "agent-add-no-description-needed.yaml" ||
        file === "agent-add-explicit-save-no-approval-gate.yaml" ||
        file === "agent-add-existing-idempotent.yaml"
      ) {
        const expectedCreateTool = testCase.successCriteria.expectedTools?.[0];
        expect(expectedCreateTool?.toolName).toBe("system_create");
        expect(expectedCreateTool?.shouldBeCalled).toBe(true);
        expect(expectedCreateTool?.argsContain).toEqual(
          file === "agent-add-existing-idempotent.yaml"
            ? {
                entityType: "agent",
                url: "yeehaa.io",
              }
            : {
                entityType: "agent",
                url: "mylittlephoney.com",
              },
        );
        continue;
      }

      if (file === "agent-approve.yaml") {
        const expectedUpdateTool = testCase.successCriteria.expectedTools?.[0];
        expect(expectedUpdateTool?.toolName).toBe("system_update");
        expect(expectedUpdateTool?.shouldBeCalled).toBe(true);
        expect(expectedUpdateTool?.argsContain).toEqual({
          entityType: "agent",
          id: "old-agent.io",
        });
        expect(testCase.successCriteria.responseContains).toContain("Approved");
        continue;
      }

      const expectedA2ATool = testCase.successCriteria.expectedTools?.find(
        (tool) => tool.toolName === "a2a_call",
      );
      expect(expectedA2ATool?.shouldBeCalled).toBe(false);
    }
  });

  it("loads the rover multi-turn agent add follow-up regression eval", async () => {
    const filePath = join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "brains",
      "rover",
      "test-cases",
      "multi-turn",
      "agent-add-after-save-first-follow-up.yaml",
    );

    const loader = YAMLLoader.createFresh({ directory: import.meta.dir });
    const testCase = await loader.loadTestCase(filePath);

    expect(testCase.type).toBe("multi_turn");
    if (testCase.type === "plugin") {
      throw new Error("Expected an agent evaluation test case");
    }

    expect(testCase.turns).toHaveLength(2);
    expect(
      testCase.turns[1]?.successCriteria?.expectedTools?.[0],
    ).toMatchObject({
      toolName: "system_create",
      shouldBeCalled: true,
      argsContain: {
        entityType: "agent",
        url: "mylittlephoney.com",
      },
    });
  });

  it("loads the rover multi-turn add-follow-up no-approval-gate evals", async () => {
    const cases = [
      "agent-approve-after-refusal-follow-up.yaml",
      "agent-approve-then-call.yaml",
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
        "multi-turn",
        file,
      );

      const testCase = await loader.loadTestCase(filePath);
      expect(testCase.type).toBe("multi_turn");
      if (testCase.type === "plugin") {
        throw new Error("Expected an agent evaluation test case");
      }

      expect(
        testCase.turns[0]?.successCriteria?.expectedTools?.[0],
      ).toMatchObject({
        toolName: "a2a_call",
        shouldBeCalled: false,
      });
      const expectedUrl =
        file === "agent-approve-then-call.yaml"
          ? "save-it-regression.example"
          : "mylittlephoney.com";
      expect(
        testCase.turns[1]?.successCriteria?.expectedTools?.[0],
      ).toMatchObject({
        toolName: "system_create",
        shouldBeCalled: true,
        argsContain: {
          entityType: "agent",
          url: expectedUrl,
        },
      });
      expect(testCase.turns[1]?.successCriteria?.responseNotContains).toContain(
        "discovered rather than approved",
      );
    }
  });

  it("loads the basic rover agent-add eval with structured url args", async () => {
    const filePath = join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "brains",
      "rover",
      "test-cases",
      "tool-invocation",
      "agent-add.yaml",
    );

    const loader = YAMLLoader.createFresh({ directory: import.meta.dir });
    const testCase = await loader.loadTestCase(filePath);

    expect(testCase.type).toBe("tool_invocation");
    if (testCase.type === "plugin") {
      throw new Error("Expected an agent evaluation test case");
    }

    expect(testCase.successCriteria.expectedTools?.[0]).toMatchObject({
      toolName: "system_create",
      shouldBeCalled: true,
      argsContain: {
        entityType: "agent",
        url: "yeehaa.io",
      },
    });
  });
});
