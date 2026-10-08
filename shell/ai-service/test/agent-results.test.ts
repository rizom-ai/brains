import { describe, expect, it } from "bun:test";

import {
  buildAgentContactCandidateContext,
  buildAgentContactCandidates,
  buildEntityMemoryContext,
  buildEntityMemoryRefs,
  buildRetrievedEntityRefs,
  extractToolResults,
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

  it("fall back to the best-scored results when the answer names none", () => {
    expect(sourceIds("A general answer.")).toEqual([
      "note:note-a",
      "note:note-b",
      "note:note-c",
      "post:read-directly",
    ]);
    expect(sourceIds()).toEqual(sourceIds("A general answer."));
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
