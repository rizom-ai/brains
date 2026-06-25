import { describe, expect, it } from "bun:test";

import {
  buildEntityMemoryContext,
  buildEntityMemoryRefs,
  extractToolResults,
} from "../src/agent-results";

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

  it("surfaces structured cards returned by successful tool data", () => {
    const results = extractToolResults([
      {
        toolCalls: [
          {
            toolCallId: "tool-1",
            toolName: "playbook_start",
            input: { playbookId: "rover-onboarding" },
          },
        ],
        toolResults: [
          {
            toolCallId: "tool-1",
            toolName: "playbook_start",
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
