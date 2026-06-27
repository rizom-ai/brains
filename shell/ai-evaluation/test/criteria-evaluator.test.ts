import { describe, expect, it } from "bun:test";
import { evaluateCriteria } from "../src/criteria-evaluator";

describe("evaluateCriteria", () => {
  it("passes responseContainsAny when any alternative is present", () => {
    const results = evaluateCriteria(
      {
        responseContainsAny: [["not found", "doesn't exist"]],
      },
      { text: "That target doesn't exist." },
      [],
    );

    expect(results).toEqual([
      expect.objectContaining({
        criterion: "responseContainsAny",
        passed: true,
      }),
    ]);
  });

  it("fails responseContainsAny when no alternatives are present", () => {
    const results = evaluateCriteria(
      {
        responseContainsAny: [["not found", "doesn't exist"]],
      },
      { text: "Still running." },
      [],
    );

    expect(results).toEqual([
      expect.objectContaining({
        criterion: "responseContainsAny",
        passed: false,
        message:
          'Response does not contain any expected text: "not found" or "doesn\'t exist"',
      }),
    ]);
  });

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

  it("passes expectedAnyTool when any listed tool has matching args", () => {
    const results = evaluateCriteria(
      {
        expectedAnyTool: [
          {
            toolNames: ["system_list", "system_search"],
            argsContain: { entityType: "project" },
            shouldBeCalled: true,
          },
        ],
      },
      { text: "found it" },
      [
        {
          toolName: "system_search",
          args: { entityType: "project" },
          result: {},
        },
      ],
    );

    expect(results).toEqual([
      expect.objectContaining({ criterion: "expectedAnyTool", passed: true }),
    ]);
  });

  it("fails expectedAnyTool when listed tools were called without matching args", () => {
    const results = evaluateCriteria(
      {
        expectedAnyTool: [
          {
            toolNames: ["system_list", "system_search"],
            argsContain: { entityType: "project" },
            shouldBeCalled: true,
          },
        ],
      },
      { text: "found it" },
      [{ toolName: "system_search", args: { entityType: "post" }, result: {} }],
    );

    expect(results).toEqual([
      expect.objectContaining({
        criterion: "expectedAnyTool",
        passed: false,
        message:
          'Expected one of [system_list, system_search] with args {"entityType":"project"} was not called',
      }),
    ]);
  });
});
