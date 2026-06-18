import { describe, expect, it } from "bun:test";

import {
  buildEntityMemoryContext,
  buildEntityMemoryRefs,
  extractToolResults,
} from "../src/agent-results";

describe("extractToolResults", () => {
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
        args: { entityType: "base", id: "rizom-note" },
        data: { updated: "rizom-note" },
      },
    ]);

    expect(refs).toEqual([
      { entityType: "base", entityId: "rizom-note", operation: "updated" },
    ]);
  });

  it("records created entity ids from confirmed create results", () => {
    const refs = buildEntityMemoryRefs([
      {
        toolName: "system_create",
        args: { entityType: "social-post" },
        data: { entityId: "linkedin-post", status: "generating" },
      },
    ]);

    expect(refs).toEqual([
      {
        entityType: "social-post",
        entityId: "linkedin-post",
        operation: "generating",
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
      { entityType: "link", entityId: "page-one", operation: "pending" },
      { entityType: "link", entityId: "page-two", operation: "pending" },
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
      { entityType: "document", entityId: "draft-doc", operation: "pending" },
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
  it("builds model-only context without footer-shaped text", () => {
    const context = buildEntityMemoryContext([
      { entityType: "base", entityId: "rizom-note", operation: "updated" },
    ]);

    expect(context).toContain("Internal entity refs");
    expect(context).toContain("base rizom-note (updated)");
    expect(context).not.toContain("Entities affected this turn");
    expect(context).not.toContain("Reference these IDs directly");
  });
});
