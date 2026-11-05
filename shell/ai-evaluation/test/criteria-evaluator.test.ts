import { describe, expect, it } from "bun:test";
import { evaluateCriteria } from "../src/criteria-evaluator";

describe("evaluateCriteria", () => {
  it("passes responseEquals only for a byte-for-byte match", () => {
    const exact = "# Saved note\n\nKeep **this** unchanged.";
    const results = evaluateCriteria(
      { responseEquals: exact },
      { text: exact },
      [],
    );

    expect(results).toEqual([
      expect.objectContaining({ criterion: "responseEquals", passed: true }),
    ]);
  });

  it("fails responseEquals when content is reformatted or wrapped", () => {
    const exact = "# Saved note\n\nKeep **this** unchanged.";
    const results = evaluateCriteria(
      { responseEquals: exact },
      { text: `Here is the note:\n\n${exact}` },
      [],
    );

    expect(results).toEqual([
      expect.objectContaining({
        criterion: "responseEquals",
        passed: false,
        message: "Response does not exactly match expected text",
      }),
    ]);
  });

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
      [{ toolName: "playbook_manage", args: {}, result: {} }],
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

  describe("expectedSources", () => {
    const writerGuide = {
      id: "guide:writer",
      url: "https://docs.rizom.ai/guides/writer",
    };

    it("passes when the reply cites the source at its address", () => {
      const results = evaluateCriteria(
        {
          expectedSources: [
            {
              id: "guide:writer",
              url: "https://docs.rizom.ai/guides/writer",
              cited: true,
            },
          ],
        },
        { text: "Start with the writer guide.", sources: [writerGuide] },
        [],
      );

      expect(results).toEqual([
        expect.objectContaining({ criterion: "expectedSources", passed: true }),
      ]);
    });

    it("fails when the reply does not cite the source", () => {
      const results = evaluateCriteria(
        { expectedSources: [{ id: "guide:team", cited: true }] },
        { text: "Start with the writer guide.", sources: [writerGuide] },
        [],
      );

      expect(results).toEqual([
        expect.objectContaining({
          criterion: "expectedSources",
          passed: false,
          actual: ["guide:writer"],
          message: "Expected source guide:team was not cited",
        }),
      ]);
    });

    it("fails when the source is cited without its address", () => {
      const results = evaluateCriteria(
        {
          expectedSources: [
            {
              id: "guide:writer",
              url: "https://docs.rizom.ai/guides/writer",
              cited: true,
            },
          ],
        },
        {
          text: "Start with the writer guide.",
          sources: [{ id: "guide:writer" }],
        },
        [],
      );

      expect(results).toEqual([
        expect.objectContaining({
          criterion: "expectedSources",
          passed: false,
          actual: undefined,
          message:
            "Source guide:writer was cited without https://docs.rizom.ai/guides/writer",
        }),
      ]);
    });

    it("fails when a source that should not be cited is", () => {
      const results = evaluateCriteria(
        { expectedSources: [{ id: "guide:writer", cited: false }] },
        { text: "See the setup doc.", sources: [writerGuide] },
        [],
      );

      expect(results).toEqual([
        expect.objectContaining({
          criterion: "expectedSources",
          passed: false,
          message: "Source guide:writer should not be cited",
        }),
      ]);
    });

    it("reads a reply without sources as citing nothing", () => {
      const results = evaluateCriteria(
        {
          expectedSources: [
            { id: "guide:writer", cited: true },
            { id: "guide:team", cited: false },
          ],
        },
        { text: "No sources." },
        [],
      );

      expect(results.map(({ passed }) => passed)).toEqual([false, true]);
    });
  });
});

// A run cannot pin its date, so "by Friday" is checked against the run's own
// today: the due date may be today or later, never the past.
describe("argsNotBeforeToday", () => {
  const saturday = new Date("2026-10-31T12:00:00.000Z");
  const criteria = {
    expectedTools: [
      {
        toolName: "action_item_create",
        shouldBeCalled: true,
        argsNotBeforeToday: ["due"],
      },
    ],
  };
  const created = (due: string): ReturnType<typeof evaluateCriteria> =>
    evaluateCriteria(
      criteria,
      { text: "" },
      [{ toolName: "action_item_create", args: { due }, result: {} }],
      saturday,
    );

  it("passes a date on or after today", () => {
    expect(created("2026-10-31")).toEqual([
      expect.objectContaining({ criterion: "expectedTool", passed: true }),
    ]);
    expect(created("2026-11-06")).toEqual([
      expect.objectContaining({ criterion: "expectedTool", passed: true }),
    ]);
  });

  it("fails a date before today", () => {
    expect(created("2026-10-30")).toContainEqual(
      expect.objectContaining({
        criterion: "toolArgsNotBeforeToday",
        passed: false,
        message:
          "action_item_create.due is not a date on or after today (2026-10-31)",
      }),
    );
  });

  it("fails a value that is not a date", () => {
    expect(created("none")).toContainEqual(
      expect.objectContaining({
        criterion: "toolArgsNotBeforeToday",
        passed: false,
      }),
    );
  });
});
