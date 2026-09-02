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

  it("scopes negative expected tools to matching arguments", () => {
    const criteria = {
      expectedTools: [
        {
          toolName: "directory_sync",
          argsContain: { action: "sync" },
          shouldBeCalled: false,
        },
      ],
    };

    const statusOnly = evaluateCriteria(criteria, { text: "status" }, [
      {
        toolName: "directory_sync",
        args: { action: "status" },
        result: {},
      },
    ]);
    const sync = evaluateCriteria(criteria, { text: "sync" }, [
      {
        toolName: "directory_sync",
        args: { action: "sync" },
        result: {},
      },
    ]);

    expect(statusOnly).toEqual([
      expect.objectContaining({ criterion: "expectedTool", passed: true }),
    ]);
    expect(sync).toEqual([
      expect.objectContaining({
        criterion: "expectedTool",
        passed: false,
        message: 'Tool "directory_sync" should not have been called',
      }),
    ]);
  });

  it("passes resultErrorContains when the call was refused for the stated reason", () => {
    // Server-side refusal is the property worth asserting. Expecting the model
    // to decline to call at all tests self-censorship instead, and that varies
    // run to run for the same permission boundary.
    const results = evaluateCriteria(
      {
        expectedTools: [
          {
            toolName: "system_create",
            argsContain: { visibility: "restricted" },
            shouldBeCalled: true,
            resultErrorContains: "not allowed to write at that level",
          },
        ],
      },
      { text: "" },
      [
        {
          toolName: "system_create",
          args: { visibility: "restricted" },
          result: {
            success: false,
            error:
              'Cannot create entity with visibility "restricted" — caller permission "trusted" is not allowed to write at that level.',
          },
        },
      ],
    );

    expect(results).toContainEqual(
      expect.objectContaining({
        criterion: "toolResultErrorContains",
        passed: true,
      }),
    );
  });

  it("fails resultErrorContains when the call succeeded instead of being refused", () => {
    const results = evaluateCriteria(
      {
        expectedTools: [
          {
            toolName: "system_create",
            shouldBeCalled: true,
            resultErrorContains: "not allowed to write at that level",
          },
        ],
      },
      { text: "" },
      [
        {
          toolName: "system_create",
          args: { visibility: "restricted" },
          result: { success: true, entityId: "note:leak" },
        },
      ],
    );

    expect(results).toContainEqual(
      expect.objectContaining({
        criterion: "toolResultErrorContains",
        passed: false,
      }),
    );
  });

  it("fails resultRefused when the call was refused", () => {
    // shouldBeCalled only proves the model invoked the tool. A permission
    // refusal still counts as "called", so a case asserting a successful write
    // stays green while the write is actually denied.
    const results = evaluateCriteria(
      {
        expectedTools: [
          {
            toolName: "system_create",
            shouldBeCalled: true,
            resultRefused: false,
          },
        ],
      },
      { text: "" },
      [
        {
          toolName: "system_create",
          args: { entityType: "note" },
          result: {
            success: false,
            error:
              "Creating `note` requires Admin permission; your current permission is Trusted.",
          },
        },
      ],
    );

    expect(results).toContainEqual(
      expect.objectContaining({
        criterion: "toolResultRefused",
        passed: false,
      }),
    );
  });

  it("passes resultRefused when the call actually succeeded", () => {
    const results = evaluateCriteria(
      {
        expectedTools: [
          {
            toolName: "system_create",
            shouldBeCalled: true,
            resultRefused: false,
          },
        ],
      },
      { text: "" },
      [
        {
          toolName: "system_create",
          args: { entityType: "note" },
          result: { success: true, entityId: "note:kept" },
        },
      ],
    );

    expect(results).toContainEqual(
      expect.objectContaining({ criterion: "toolResultRefused", passed: true }),
    );
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
      [{ toolName: "playbooks_manage", args: {}, result: {} }],
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
