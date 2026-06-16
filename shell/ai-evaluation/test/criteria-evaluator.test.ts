import { describe, expect, it } from "bun:test";
import { evaluateCriteria } from "../src/criteria-evaluator";

describe("evaluateCriteria", () => {
  it("passes expectedAnyTool when any listed tool was called", () => {
    const results = evaluateCriteria(
      {
        expectedAnyTool: [
          { toolNames: ["system_get", "system_search"], shouldBeCalled: true },
        ],
      },
      { text: "found it" },
      [{ toolName: "system_search", args: {}, result: {} }],
    );

    expect(results).toEqual([
      expect.objectContaining({ criterion: "expectedAnyTool", passed: true }),
    ]);
  });

  it("fails expectedAnyTool when none of the listed tools was called", () => {
    const results = evaluateCriteria(
      {
        expectedAnyTool: [
          { toolNames: ["system_get", "system_search"], shouldBeCalled: true },
        ],
      },
      { text: "found it" },
      [{ toolName: "playbook_send_event", args: {}, result: {} }],
    );

    expect(results).toEqual([
      expect.objectContaining({
        criterion: "expectedAnyTool",
        passed: false,
        message: "Expected one of [system_get, system_search] was not called",
      }),
    ]);
  });
});
