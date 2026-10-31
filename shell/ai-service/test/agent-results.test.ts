import { describe, expect, it } from "bun:test";

import {
  buildAgentContactCandidateContext,
  buildAgentContactCandidates,
  buildEntityMemoryContext,
  buildEntityMemoryRefs,
  buildRetrievedEntityRefs,
  buildSourcesCardFromContextItems,
  confirmationFrom,
  extractToolResults,
  stepFailures,
  toolCallArgs,
  toolResultFrom,
} from "../src/agent-results";

describe("buildRetrievedEntityRefs", () => {
  const entity = (id: string): Record<string, unknown> => ({
    id,
    entityType: "note",
    content: "Body",
  });

  it("records entities that successful reads returned, once each", () => {
    expect(
      buildRetrievedEntityRefs([
        { toolName: "system_get", data: { entity: entity("seed") } },
        {
          toolName: "system_search",
          data: {
            results: [{ entity: entity("seed") }, { entity: entity("b") }],
          },
        },
      ]),
    ).toEqual([
      { entityType: "note", entityId: "seed" },
      { entityType: "note", entityId: "b" },
    ]);
  });

  it("ignores failed reads and non-read tools", () => {
    expect(
      buildRetrievedEntityRefs([
        {
          toolName: "system_get",
          error: { code: "not_found", message: "Missing" },
        },
        { toolName: "system_create", data: { entityId: "new" } },
        { toolName: "system_list", data: { entities: [entity("x")] } },
      ]),
    ).toEqual([]);
  });
});

describe("extractToolResults", () => {
  it("keeps a rejected SDK attempt visible before a successful repair proposal", () => {
    const input = {
      entityType: "note",
      id: "plan",
      operation: {
        kind: "edits",
        edits: [{ oldText: "old", newText: "new" }],
        fields: { title: "New" },
      },
    };
    const error = new Error("Invalid tool input: mixed operation branches");
    const results = extractToolResults([
      {
        toolCalls: [
          {
            toolCallId: "invalid",
            toolName: "system_update",
            input,
            invalid: true,
            error,
          },
        ],
        content: [
          {
            type: "tool-error",
            toolCallId: "invalid",
            toolName: "system_update",
            input,
            error,
          },
        ],
        toolResults: [],
      },
      {
        toolCalls: [
          {
            toolCallId: "repair",
            toolName: "system_update",
            input: {
              ...input,
              operation: { kind: "edits", edits: input.operation.edits },
            },
          },
        ],
        toolResults: [
          {
            toolCallId: "repair",
            toolName: "system_update",
            output: {
              needsConfirmation: true,
              toolName: "system_update",
              summary: "Update plan?",
              args: {
                ...input,
                operation: { kind: "edits", edits: input.operation.edits },
                confirmed: true,
              },
            },
          },
        ],
      },
    ]);
    expect(results.totalToolCalls).toBe(2);
    expect(results.toolResults).toEqual([
      {
        toolName: "system_update",
        args: input,
        error: { code: "invalid_tool_call", message: error.message },
      },
    ]);
    expect(results.pendingConfirmations).toHaveLength(1);
  });

  it("records SDK execution exceptions that are absent from toolResults", () => {
    const input = { entityType: "note", id: "plan" };
    const results = extractToolResults([
      {
        toolCalls: [{ toolCallId: "failed", toolName: "system_get", input }],
        content: [
          {
            type: "tool-error",
            toolCallId: "failed",
            toolName: "system_get",
            input,
            error: new Error("Storage unavailable"),
          },
        ],
        toolResults: [],
      },
    ]);
    expect(results.totalToolCalls).toBe(1);
    expect(results.toolResults).toEqual([
      {
        toolName: "system_get",
        args: input,
        error: {
          code: "tool_execution_failed",
          message: "Storage unavailable",
        },
      },
    ]);
  });

  it("records malformed JSON calls even without record-shaped arguments", () => {
    const results = extractToolResults([
      {
        toolCalls: [
          {
            toolCallId: "malformed",
            toolName: "system_update",
            input: "{broken",
            invalid: true,
            error: new Error("Invalid JSON"),
          },
        ],
        toolResults: [],
      },
    ]);
    expect(results.totalToolCalls).toBe(1);
    expect(results.toolResults).toEqual([
      {
        toolName: "system_update",
        error: { code: "invalid_tool_call", message: "Invalid JSON" },
      },
    ]);
  });

  it("omits cached duplicate read results from extracted metrics records", () => {
    const results = extractToolResults([
      {
        toolCalls: [
          {
            toolCallId: "tool-1",
            toolName: "system_get",
            input: { entityType: "deck", id: "deck-1" },
          },
          {
            toolCallId: "tool-2",
            toolName: "system_get",
            input: { entityType: "deck", id: "deck-1" },
          },
        ],
        toolResults: [
          {
            toolCallId: "tool-1",
            toolName: "system_get",
            output: {
              success: true,
              data: {
                entity: { id: "deck-1", entityType: "deck", metadata: {} },
              },
            },
          },
          {
            toolCallId: "tool-2",
            toolName: "system_get",
            output: {
              success: true,
              cached: true,
              data: {
                entity: { id: "deck-1", entityType: "deck", metadata: {} },
              },
            },
          },
        ],
      },
    ]);

    expect(results.toolResults).toEqual([
      {
        toolName: "system_get",
        args: { entityType: "deck", id: "deck-1" },
        data: { entity: { id: "deck-1", entityType: "deck", metadata: {} } },
      },
    ]);
  });

  it("preserves structured tool error codes for follow-up candidates", () => {
    const results = extractToolResults([
      {
        toolCalls: [
          {
            toolCallId: "tool-1",
            toolName: "agent_call",
            input: { agent: "unknown.example", message: "hello" },
          },
        ],
        toolResults: [
          {
            toolCallId: "tool-1",
            toolName: "agent_call",
            output: {
              success: false,
              error:
                "Agent unknown.example is not in your directory. Add it first.",
              code: "agent_not_saved",
            },
          },
        ],
      },
    ]);

    expect(results.toolResults).toEqual([
      {
        toolName: "agent_call",
        args: { agent: "unknown.example", message: "hello" },
        error: {
          message:
            "Agent unknown.example is not in your directory. Add it first.",
          code: "agent_not_saved",
        },
      },
    ]);
  });

  it("surfaces structured cards returned by successful tool data", () => {
    const results = extractToolResults([
      {
        toolCalls: [
          {
            toolCallId: "tool-1",
            toolName: "playbook_manage",
            input: { action: "start", playbookId: "rover-onboarding" },
          },
        ],
        toolResults: [
          {
            toolCallId: "tool-1",
            toolName: "playbook_manage",
            output: {
              success: true,
              data: {
                cards: [
                  {
                    kind: "actions",
                    id: "actions:playbook:run-1",
                    title: "Continue onboarding",
                    actions: [
                      {
                        type: "event",
                        id: "playbook:run-1:NEXT",
                        label: "Keep going",
                        event: "NEXT",
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    ]);

    expect(results.cards).toEqual([
      {
        kind: "actions",
        id: "actions:playbook:run-1",
        title: "Continue onboarding",
        actions: [
          {
            type: "event",
            id: "playbook:run-1:NEXT",
            label: "Keep going",
            event: "NEXT",
          },
        ],
      },
    ]);
  });

  const confirmationOutput = (
    toolName: string,
    summary: string,
  ): Record<string, unknown> => ({
    needsConfirmation: true,
    toolName,
    summary,
    completionSummary: `${summary} done`,
    preview: `${summary} preview`,
    args: { id: "plan", confirmed: true },
  });

  it("turns a confirmation request into a pending confirmation and its approval card", () => {
    const results = extractToolResults([
      {
        toolCalls: [
          {
            toolCallId: "call-1",
            toolName: "system_delete",
            input: { id: "plan" },
          },
        ],
        toolResults: [
          {
            toolCallId: "call-1",
            toolName: "system_delete",
            output: confirmationOutput("system_delete", "Delete plan?"),
          },
        ],
      },
    ]);

    expect(results.toolResults).toEqual([]);
    expect(results.pendingConfirmations).toEqual([
      {
        id: "approval:call-1",
        toolCallId: "call-1",
        toolName: "system_delete",
        summary: "Delete plan?",
        completionSummary: "Delete plan? done",
        preview: "Delete plan? preview",
        args: { id: "plan", confirmed: true },
      },
    ]);
    expect(results.cards).toEqual([
      {
        kind: "tool-approval",
        id: "approval:call-1",
        toolCallId: "call-1",
        toolName: "system_delete",
        summary: "Delete plan?",
        completionSummary: "Delete plan? done",
        preview: "Delete plan? preview",
        state: "approval-requested",
        input: { id: "plan" },
      },
    ]);
  });

  it("names an approval without a call id by its tool and the calls made so far", () => {
    const results = extractToolResults([
      {
        toolCalls: [{ toolCallId: "read", toolName: "system_get", input: {} }],
        toolResults: [
          {
            toolCallId: "read",
            toolName: "system_get",
            output: { success: true, data: { ok: true } },
          },
        ],
      },
      {
        toolCalls: [
          { toolCallId: "", toolName: "system_delete", input: { id: "a" } },
          { toolCallId: "other", toolName: "system_get", input: {} },
        ],
        toolResults: [
          {
            toolCallId: "",
            toolName: "system_delete",
            output: {
              needsConfirmation: true,
              toolName: "system_delete",
              summary: "Delete a?",
              args: { id: "a" },
            },
          },
        ],
      },
    ]);

    expect(results.pendingConfirmations).toEqual([
      {
        id: "approval:system_delete:3",
        toolCallId: "",
        toolName: "system_delete",
        summary: "Delete a?",
        args: { id: "a" },
      },
    ]);
    expect(results.cards).toEqual([
      {
        kind: "tool-approval",
        id: "approval:system_delete:3",
        toolCallId: "",
        toolName: "system_delete",
        summary: "Delete a?",
        state: "approval-requested",
      },
    ]);
  });

  it("asks once per tool in a step and stops at the step that asked", () => {
    const results = extractToolResults([
      {
        toolCalls: [
          { toolCallId: "del-1", toolName: "system_delete", input: {} },
          { toolCallId: "del-2", toolName: "system_delete", input: {} },
          { toolCallId: "upd-1", toolName: "system_update", input: {} },
          { toolCallId: "get-1", toolName: "system_get", input: {} },
        ],
        toolResults: [
          {
            toolCallId: "del-1",
            toolName: "system_delete",
            output: confirmationOutput("system_delete", "Delete one?"),
          },
          {
            toolCallId: "del-2",
            toolName: "system_delete",
            output: confirmationOutput("system_delete", "Delete two?"),
          },
          {
            toolCallId: "upd-1",
            toolName: "system_update",
            output: confirmationOutput("system_update", "Update?"),
          },
          {
            toolCallId: "get-1",
            toolName: "system_get",
            output: { success: true, data: { ok: true } },
          },
        ],
      },
      {
        toolCalls: [{ toolCallId: "late", toolName: "system_get", input: {} }],
        toolResults: [
          {
            toolCallId: "late",
            toolName: "system_get",
            output: { success: true, data: { late: true } },
          },
        ],
      },
    ]);

    expect(
      results.pendingConfirmations.map((confirmation) => confirmation.id),
    ).toEqual(["approval:del-1", "approval:upd-1"]);
    expect(results.cards.map((card) => card.id)).toEqual([
      "approval:del-1",
      "approval:upd-1",
    ]);
    expect(results.toolResults).toEqual([
      { toolName: "system_get", args: {}, data: { ok: true } },
    ]);
    expect(results.totalToolCalls).toBe(4);
  });

  it("records a failed call once, however many ways the SDK reports it", () => {
    const error = new Error("boom");
    const results = extractToolResults([
      {
        toolCalls: [
          {
            toolCallId: "bad",
            toolName: "system_get",
            input: { id: "x" },
            error,
          },
          { toolCallId: "thrown", toolName: "system_get", input: "raw" },
        ],
        content: [
          { type: "text" },
          {
            type: "tool-error",
            toolCallId: "bad",
            toolName: "system_get",
            input: { id: "x" },
            error,
          },
          {
            type: "tool-error",
            toolCallId: "thrown",
            toolName: "system_get",
            input: "raw",
            error: "string failure",
          },
          {
            type: "tool-error",
            toolCallId: "thrown",
            toolName: "system_get",
            input: "raw",
            error: "again",
          },
        ],
        toolResults: [
          {
            toolCallId: "bad",
            toolName: "system_get",
            output: { success: true, data: { ok: true } },
          },
        ],
      },
    ]);

    expect(results.toolResults).toEqual([
      {
        toolName: "system_get",
        args: { id: "x" },
        error: { code: "invalid_tool_call", message: "boom" },
      },
      {
        toolName: "system_get",
        error: {
          code: "tool_execution_failed",
          message: "Tool execution failed",
        },
      },
    ]);
  });

  it("skips null outputs and keeps unrecognized outputs by tool name only", () => {
    const results = extractToolResults([
      {
        toolCalls: [
          { toolCallId: "nil", toolName: "system_get", input: { id: "a" } },
          { toolCallId: "odd", toolName: "system_get", input: { id: "b" } },
        ],
        toolResults: [
          { toolCallId: "nil", toolName: "system_get", output: null },
          {
            toolCallId: "odd",
            toolName: "system_get",
            output: "plain text",
          },
        ],
      },
    ]);

    expect(results.toolResults).toEqual([{ toolName: "system_get" }]);
  });

  it("keeps a successful result's job and its attachment card in order", () => {
    const results = extractToolResults([
      {
        toolCalls: [
          {
            toolCallId: "img",
            toolName: "image_generate",
            input: { prompt: "a fox" },
          },
          {
            toolCallId: "plain",
            toolName: "system_get",
            input: { id: "x" },
          },
        ],
        toolResults: [
          {
            toolCallId: "img",
            toolName: "image_generate",
            output: {
              success: true,
              data: {
                jobId: "job-1",
                entityId: "fox",
                attachment: {
                  mediaType: "image/png",
                  url: "/a/fox.png",
                },
              },
            },
          },
          {
            toolCallId: "plain",
            toolName: "system_get",
            output: { success: true, data: { ok: true } },
          },
        ],
      },
    ]);

    expect(results.toolResults).toEqual([
      {
        toolName: "image_generate",
        args: { prompt: "a fox" },
        jobId: "job-1",
        data: {
          jobId: "job-1",
          entityId: "fox",
          attachment: { mediaType: "image/png", url: "/a/fox.png" },
        },
      },
      { toolName: "system_get", args: { id: "x" }, data: { ok: true } },
    ]);
    expect(results.cards).toEqual([
      {
        kind: "attachment",
        id: "attachment:fox",
        jobId: "job-1",
        title: "Generated image",
        description:
          "image generation has been queued. This artifact will open once the job completes.",
        attachment: { mediaType: "image/png", url: "/a/fox.png" },
      },
    ]);
  });
});

describe("a step's tool-call arguments", () => {
  it("are the record-shaped inputs of calls that carry an id", () => {
    const args = toolCallArgs({
      toolCalls: [
        { toolCallId: "a", toolName: "system_get", input: { id: "x" } },
        { toolCallId: "", toolName: "system_get", input: { id: "y" } },
        { toolCallId: "b", toolName: "system_get", input: "{broken" },
        { toolCallId: "c", toolName: "system_get", input: {} },
      ],
      toolResults: [],
    });

    expect([...args]).toEqual([
      ["a", { id: "x" }],
      ["c", {}],
    ]);
  });
});

describe("a step's failures", () => {
  it("are rejected calls, then execution errors, each call once", () => {
    const error = new Error("rejected");
    const step = {
      toolCalls: [
        {
          toolCallId: "invalid",
          toolName: "system_update",
          input: { id: "a" },
          invalid: true,
        },
        { toolCallId: "ok", toolName: "system_get", input: { id: "b" } },
        {
          toolCallId: "errored",
          toolName: "system_get",
          input: { id: "c" },
          error,
        },
      ],
      content: [
        {
          type: "tool-error",
          toolCallId: "invalid",
          toolName: "system_update",
          input: { id: "a" },
          error,
        },
        {
          type: "tool-error",
          toolCallId: "thrown",
          toolName: "system_get",
          input: "raw",
          error: new Error("Storage unavailable"),
        },
        {
          type: "tool-error",
          toolCallId: "thrown",
          toolName: "system_get",
          input: "raw",
          error: new Error("again"),
        },
        { type: "tool-error", toolCallId: "partial" },
      ],
      toolResults: [],
    };

    const failures = stepFailures(
      step,
      new Map([
        ["invalid", { id: "a" }],
        ["thrown", { from: "call" }],
      ]),
    );

    expect([...failures.callIds]).toEqual(["invalid", "errored", "thrown"]);
    expect(failures.results).toEqual([
      {
        toolName: "system_update",
        args: { id: "a" },
        error: {
          code: "invalid_tool_call",
          message: "SDK rejected the tool call",
        },
      },
      {
        toolName: "system_get",
        error: { code: "invalid_tool_call", message: "rejected" },
      },
      {
        toolName: "system_get",
        args: { from: "call" },
        error: {
          code: "tool_execution_failed",
          message: "Storage unavailable",
        },
      },
    ]);
  });

  it("are none for a step whose calls all ran", () => {
    const failures = stepFailures(
      {
        toolCalls: [{ toolCallId: "ok", toolName: "system_get", input: {} }],
        toolResults: [],
      },
      new Map(),
    );

    expect(failures.results).toEqual([]);
    expect(failures.callIds.size).toBe(0);
  });
});

describe("a confirmation request", () => {
  it("becomes a pending confirmation and an approval card from the same fields", () => {
    const requested = confirmationFrom({
      toolResult: {
        toolCallId: "call-1",
        toolName: "system_delete",
        output: {
          needsConfirmation: true,
          toolName: "system_delete",
          summary: "Delete plan?",
          completionSummary: "Deleted plan",
          preview: "plan.md",
          args: { id: "plan", confirmed: true },
        },
      },
      args: { id: "plan" },
      toolCallsSoFar: 4,
    });

    expect(requested).toEqual({
      confirmation: {
        id: "approval:call-1",
        toolCallId: "call-1",
        toolName: "system_delete",
        summary: "Delete plan?",
        completionSummary: "Deleted plan",
        preview: "plan.md",
        args: { id: "plan", confirmed: true },
      },
      card: {
        kind: "tool-approval",
        id: "approval:call-1",
        toolCallId: "call-1",
        toolName: "system_delete",
        summary: "Delete plan?",
        completionSummary: "Deleted plan",
        preview: "plan.md",
        state: "approval-requested",
        input: { id: "plan" },
      },
    });
  });

  it("is named by its tool and the calls so far when it has no call id", () => {
    const requested = confirmationFrom({
      toolResult: {
        toolCallId: "",
        toolName: "system_delete",
        output: {
          needsConfirmation: true,
          toolName: "system_delete",
          summary: "Delete?",
          args: {},
        },
      },
      args: undefined,
      toolCallsSoFar: 4,
    });

    expect(requested?.confirmation.id).toBe("approval:system_delete:4");
    expect(requested?.card).toEqual({
      kind: "tool-approval",
      id: "approval:system_delete:4",
      toolCallId: "",
      toolName: "system_delete",
      summary: "Delete?",
      state: "approval-requested",
    });
  });

  it("is absent from an output that does not ask", () => {
    expect(
      confirmationFrom({
        toolResult: {
          toolCallId: "call-1",
          toolName: "system_get",
          output: { success: true, data: {} },
        },
        args: undefined,
        toolCallsSoFar: 1,
      }),
    ).toBeUndefined();
  });
});

describe("a tool's result", () => {
  const resultFrom = (
    output: unknown,
    args?: Record<string, unknown>,
  ): ReturnType<typeof toolResultFrom> =>
    toolResultFrom({
      toolResult: { toolCallId: "call-1", toolName: "system_get", output },
      args,
      links: undefined,
    });

  it("keeps an unrecognized output by its tool name only", () => {
    expect(resultFrom("plain text", { id: "x" })).toEqual({
      result: { toolName: "system_get" },
      cards: [],
      sources: [],
    });
  });

  it("is absent for a cached repeat", () => {
    expect(
      resultFrom({ success: true, cached: true, data: { ok: true } }),
    ).toBeUndefined();
  });

  it("carries a tool error with its code", () => {
    expect(
      resultFrom(
        { success: false, error: "Missing", code: "not_found" },
        { id: "x" },
      ),
    ).toEqual({
      result: {
        toolName: "system_get",
        args: { id: "x" },
        error: { message: "Missing", code: "not_found" },
      },
      cards: [],
      sources: [],
    });
  });

  it("carries data, its job, its cards, and its sources", () => {
    const card = {
      kind: "actions",
      id: "actions:1",
      title: "Next",
      actions: [{ type: "event", id: "a:1", label: "Go", event: "GO" }],
    };
    const outcome = resultFrom({
      success: true,
      data: {
        jobId: "job-1",
        entityId: "fox",
        attachment: { mediaType: "image/png", url: "/a/fox.png" },
        entity: { id: "fox", entityType: "image", metadata: {} },
        cards: [card],
      },
    });

    expect(outcome?.result.jobId).toBe("job-1");
    expect(outcome?.result.data).toEqual(
      expect.objectContaining({ entityId: "fox" }),
    );
    expect(outcome?.cards.map((each) => each.id)).toEqual([
      "actions:1",
      "attachment:fox",
    ]);
    expect(outcome?.sources).toEqual([
      expect.objectContaining({
        citation: expect.objectContaining({ entityId: "fox" }),
      }),
    ]);
  });

  it("has no data when a success carries none", () => {
    expect(resultFrom({ success: true }, { id: "x" })).toEqual({
      result: { toolName: "system_get", args: { id: "x" } },
      cards: [],
      sources: [],
    });
  });
});

describe("an answer's sources", () => {
  const hit = (id: string, title: string, score: number): unknown => ({
    entity: {
      id,
      entityType: id.startsWith("note") ? "note" : "post",
      metadata: { title },
    },
    score,
  });
  const steps = [
    {
      toolCalls: [{ toolCallId: "s", toolName: "system_search", input: {} }],
      toolResults: [
        {
          toolCallId: "s",
          toolName: "system_search",
          output: {
            success: true,
            data: {
              results: [
                hit("note-a", "Institutional memory", 0.9),
                hit("note-b", "Writing sample", 0.85),
                hit("note-c", "Analysis notes", 0.8),
                hit(
                  "a-colleague-without-context",
                  "A Colleague Without Context",
                  0.7,
                ),
                hit("heroics", "Heroics Are Not Infrastructure", 0.6),
              ],
            },
          },
        },
      ],
    },
    {
      toolCalls: [{ toolCallId: "g", toolName: "system_get", input: {} }],
      toolResults: [
        {
          toolCallId: "g",
          toolName: "system_get",
          output: {
            success: true,
            data: {
              entity: {
                id: "read-directly",
                entityType: "post",
                metadata: { title: "Read Directly" },
              },
            },
          },
        },
      ],
    },
  ];
  const sourceIds = (text?: string): string[] =>
    extractToolResults(steps, text).cards.flatMap((card) =>
      card.kind === "sources" ? card.sources.map((source) => source.id) : [],
    );

  it("are the results the answer names, however they scored, and what it read directly", () => {
    expect(
      sourceIds(
        "Start with **A Colleague without context**, then heroics are not infrastructure.",
      ),
    ).toEqual([
      "post:a-colleague-without-context",
      "post:heroics",
      "post:read-directly",
    ]);
  });

  it("include a result whose page the answer links, though it names another title", () => {
    const links = {
      isCitable: (): boolean => true,
      urlFor: (entityType: string, slug: string): string =>
        `/${entityType}s/${slug}`,
      siteBaseUrl: "example.com",
    };
    const linked = (text: string): string[] =>
      extractToolResults(steps, text, links).cards.flatMap((card) =>
        card.kind === "sources" ? card.sources.map((source) => source.id) : [],
      );

    expect(
      linked(
        "Read [the piece on heroics](/posts/heroics) or https://example.com/notes/note-c.",
      ),
    ).toEqual(["note:note-c", "post:heroics", "post:read-directly"]);
    expect(linked("See /posts/heroics-revisited and /posts.")).toEqual(
      linked("A general answer."),
    );
  });

  it("fall back to the best-scored results when the answer names none", () => {
    expect(sourceIds("A general answer.")).toEqual([
      "note:note-a",
      "note:note-b",
      "note:note-c",
      "post:read-directly",
    ]);
    expect(sourceIds()).toEqual(sourceIds("A general answer."));
  });

  it("keep the sources a tool attributes itself, with their brains", () => {
    const cards = extractToolResults(
      [
        {
          toolCalls: [{ toolCallId: "n", toolName: "network_ask", input: {} }],
          toolResults: [
            {
              toolCallId: "n",
              toolName: "network_ask",
              output: {
                success: true,
                data: {
                  answers: [],
                  sources: [
                    {
                      id: "agent:jo.example",
                      title: "Jo",
                      source: "agent",
                      url: "https://jo.example",
                      brain: { name: "Jo", url: "https://jo.example" },
                    },
                    { title: "not a citation" },
                  ],
                },
              },
            },
          ],
        },
      ],
      "Jo says to start with the soil.",
    ).cards;
    expect(cards).toEqual([
      {
        kind: "sources",
        id: "sources:tool-results",
        title: "Retrieved sources",
        sources: [
          {
            id: "agent:jo.example",
            title: "Jo",
            source: "agent",
            url: "https://jo.example",
            brain: { name: "Jo", url: "https://jo.example" },
          },
        ],
      },
    ]);
  });
});

describe("buildAgentContactCandidates", () => {
  it("builds typed agent_connect candidates from agent not-saved rejections", () => {
    const candidates = buildAgentContactCandidates([
      {
        toolName: "agent_call",
        args: { agent: "save-it-regression.example" },
        error: {
          message:
            "Agent save-it-regression.example is not in your directory. Add it first.",
          code: "agent_not_saved",
        },
      },
    ]);

    expect(candidates).toEqual([
      { source: { kind: "url", url: "save-it-regression.example" } },
    ]);

    const context = buildAgentContactCandidateContext(candidates);
    expect(context).toContain("Internal agent contact candidates");
    expect(context).toContain("agent_connect candidate args");
    expect(context).toContain("save-it-regression.example");
    expect(context).not.toContain("If the prior conversation turn");
  });

  it("builds typed agent_connect candidates from failed exact-domain verification", () => {
    const candidates = buildAgentContactCandidates([
      {
        toolName: "agent_call",
        args: { agent: "verify-failed.example" },
        error: {
          message: "Could not verify an A2A Agent Card",
          code: "agent_card_unavailable",
        },
      },
    ]);

    expect(candidates).toEqual([
      { source: { kind: "url", url: "verify-failed.example" } },
    ]);
  });

  it("builds typed agent_connect candidates from successful one-shot agent calls", () => {
    const candidates = buildAgentContactCandidates([
      {
        toolName: "agent_call",
        args: { agent: "one-shot.example" },
        data: {
          state: "completed",
          response: "hello",
          agentCall: { mode: "one-shot", agent: "one-shot.example" },
          agentContactCandidate: {
            source: { kind: "url", url: "one-shot.example" },
          },
        },
      },
    ]);

    expect(candidates).toEqual([
      { source: { kind: "url", url: "one-shot.example" } },
    ]);
  });

  it("does not build candidates for approved, archived, or saved-call results", () => {
    const candidates = buildAgentContactCandidates([
      {
        toolName: "agent_call",
        args: { agent: "old.io" },
        error: { message: "Approve it first", code: "agent_not_approved" },
      },
      {
        toolName: "agent_call",
        args: { agent: "archived.io" },
        error: { message: "Archived", code: "agent_archived" },
      },
      {
        toolName: "agent_call",
        args: { agent: "yeehaa.io" },
        data: { state: "completed", response: "hello" },
      },
    ]);

    expect(candidates).toEqual([]);
  });
});

describe("buildEntityMemoryRefs", () => {
  it("records updated entity ids from confirmed update results", () => {
    const refs = buildEntityMemoryRefs([
      {
        toolName: "system_update",
        args: { entityType: "note", id: "rizom-note" },
        data: { updated: "rizom-note" },
      },
    ]);

    expect(refs).toEqual([
      { entityType: "note", entityId: "rizom-note", operation: "updated" },
    ]);
  });

  it("records created entity ids with stable operation, title, and status", () => {
    const refs = buildEntityMemoryRefs([
      {
        toolName: "system_create",
        args: { entityType: "social-post", title: "LinkedIn draft" },
        data: { entityId: "linkedin-post", status: "generating" },
      },
    ]);

    expect(refs).toEqual([
      {
        entityType: "social-post",
        entityId: "linkedin-post",
        operation: "created",
        title: "LinkedIn draft",
        status: "generating",
      },
    ]);
  });

  it("lists every entity created in a turn as structured refs", () => {
    const refs = buildEntityMemoryRefs([
      {
        toolName: "system_create",
        args: { entityType: "link" },
        data: { entityId: "page-one", status: "pending" },
      },
      {
        toolName: "system_create",
        args: { entityType: "link" },
        data: { entityId: "page-two", status: "pending" },
      },
    ]);

    expect(refs).toEqual([
      {
        entityType: "link",
        entityId: "page-one",
        operation: "created",
        status: "pending",
      },
      {
        entityType: "link",
        entityId: "page-two",
        operation: "created",
        status: "pending",
      },
    ]);
  });

  it("surfaces pending placeholders so they are addressable before enrichment", () => {
    const refs = buildEntityMemoryRefs([
      {
        toolName: "system_create",
        args: { entityType: "document" },
        data: { entityId: "draft-doc", status: "pending" },
      },
    ]);

    expect(refs).toEqual([
      {
        entityType: "document",
        entityId: "draft-doc",
        operation: "created",
        status: "pending",
      },
    ]);
  });

  it("does not repeat an entity id touched more than once in a turn", () => {
    const refs = buildEntityMemoryRefs([
      {
        toolName: "system_create",
        args: { entityType: "link" },
        data: { entityId: "page-one", status: "pending" },
      },
      {
        toolName: "system_update",
        args: { entityType: "link", id: "page-one" },
        data: { updated: "page-one" },
      },
    ]);

    expect(refs).toHaveLength(1);
    expect(refs[0]?.entityId).toBe("page-one");
  });
});

describe("buildEntityMemoryContext", () => {
  it("builds model-only context with follow-up target guidance", () => {
    const context = buildEntityMemoryContext([
      { entityType: "note", entityId: "rizom-note", operation: "updated" },
      {
        entityType: "social-post",
        entityId: "linkedin-post",
        operation: "created",
        status: "generating",
      },
    ]);

    expect(context).toContain("Internal entity refs");
    expect(context).toContain("canonical entityId");
    expect(context).toContain("Do not derive or rewrite IDs from titles");
    expect(context).toContain("cover-image generation");
    expect(context).toContain("entityType: note; entityId: rizom-note");
    expect(context).toContain(
      "entityType: social-post; entityId: linkedin-post",
    );
    expect(context).toContain("status: generating");
    expect(context).not.toContain("Entities affected this turn");
    expect(context).not.toContain("Reference these IDs directly");
  });

  it("records listed entity ids for list-detail follow-ups", () => {
    const refs = buildEntityMemoryRefs([
      {
        toolName: "system_list",
        args: { entityType: "post" },
        data: {
          entities: [
            {
              id: "knowledge-flow-systems",
              entityType: "post",
              metadata: {
                title: "Knowledge Flow Systems",
                status: "published",
              },
            },
            {
              id: "ai-and-knowledge-work",
              entityType: "post",
              metadata: { title: "AI and Knowledge Work" },
            },
          ],
          count: 2,
        },
      },
    ]);

    expect(refs).toEqual([
      {
        entityType: "post",
        entityId: "knowledge-flow-systems",
        operation: "listed",
        listIndex: 1,
        title: "Knowledge Flow Systems",
        status: "published",
      },
      {
        entityType: "post",
        entityId: "ai-and-knowledge-work",
        operation: "listed",
        listIndex: 2,
        title: "AI and Knowledge Work",
      },
    ]);

    const context = buildEntityMemoryContext(refs);
    expect(context).toContain("Internal entity refs");
    expect(context).toContain(
      "entityType: post; entityId: knowledge-flow-systems",
    );
    expect(context).toContain("item 1");
    expect(context).toContain("Knowledge Flow Systems");
    expect(context).toContain(
      "entityType: post; entityId: ai-and-knowledge-work",
    );
    expect(context).not.toContain("Entities listed this turn");
  });
});

describe("a retrieved source as the site shows it", () => {
  const search = (
    entity: Record<string, unknown>,
  ): Parameters<typeof extractToolResults>[0] => [
    {
      toolCalls: [{ toolCallId: "s", toolName: "system_search", input: {} }],
      toolResults: [
        {
          toolCallId: "s",
          toolName: "system_search",
          output: {
            success: true,
            data: { results: [{ entity, score: 0.8 }] },
          },
        },
      ],
    },
  ];
  const links = {
    isCitable: (entityType: string): boolean => entityType === "book-section",
    urlFor: (_entityType: string, slug: string): string => `/books/${slug}`,
    siteBaseUrl: "friedrich.rizom.ai",
  };
  const sourcesOf = (
    entity: Record<string, unknown>,
  ): Array<{ title?: string | undefined; url?: string | undefined }> =>
    extractToolResults(search(entity), undefined, links).cards.flatMap(
      (card) => (card.kind === "sources" ? card.sources : []),
    );

  it("cites a section by the name its page carries, linked to that page", () => {
    expect(
      sourcesOf({
        id: "ecce-homo:00006-warum-ich-so-weise-bin:00008-3",
        entityType: "book-section",
        metadata: { title: "3", pageTitle: "EH-Weise-3", slug: "ecce-homo/8" },
      }),
    ).toMatchObject([
      {
        title: "EH-Weise-3",
        url: "https://friedrich.rizom.ai/books/ecce-homo/8",
      },
    ]);
  });

  it("does not link a type the site does not cite", () => {
    const [source] = sourcesOf({
      id: "ecce-homo",
      entityType: "book",
      metadata: { title: "Ecce homo", slug: "ecce-homo" },
    });
    expect(source?.title).toBe("Ecce homo");
    expect(source?.url).toBeUndefined();
  });
});

describe("a source's excerpt", () => {
  it("is the text of a source read directly, without its frontmatter", () => {
    const [source] = extractToolResults([
      {
        toolCalls: [{ toolCallId: "g", toolName: "system_get", input: {} }],
        toolResults: [
          {
            toolCallId: "g",
            toolName: "system_get",
            output: {
              success: true,
              data: {
                entity: {
                  id: "ecce-homo:00046-also-sprach-zarathustra:00051-6",
                  entityType: "book-section",
                  content:
                    "---\ntitle: '6'\nbook: ecce-homo\nsection: EH-ZA-6\n---\nDer Text des Abschnitts.",
                  metadata: { title: "6", pageTitle: "EH-ZA-6" },
                },
              },
            },
          },
        ],
      },
    ]).cards.flatMap((card) => (card.kind === "sources" ? card.sources : []));

    expect(source?.excerpt).toBe("Der Text des Abschnitts.");
  });

  it("is absent for a source whose content is all frontmatter", () => {
    const [source] = extractToolResults([
      {
        toolCalls: [{ toolCallId: "g", toolName: "system_get", input: {} }],
        toolResults: [
          {
            toolCallId: "g",
            toolName: "system_get",
            output: {
              success: true,
              data: {
                entity: {
                  id: "style-guide",
                  entityType: "style-guide",
                  content:
                    "---\nname: Rizom\nvoice:\n  summary: Direct\n---\n\n",
                  metadata: {},
                },
              },
            },
          },
        ],
      },
    ]).cards.flatMap((card) => (card.kind === "sources" ? card.sources : []));

    expect(source?.id).toBe("style-guide:style-guide");
    expect(source?.excerpt).toBeUndefined();
  });

  it("is absent for a retrieved context item with only whitespace", () => {
    const card = buildSourcesCardFromContextItems([
      { id: "blank", source: "agent-context", content: "  \n" },
    ]);
    const [source] = card?.kind === "sources" ? card.sources : [];

    expect(source?.id).toBe("blank");
    expect(source?.excerpt).toBeUndefined();
  });
});
