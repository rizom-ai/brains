import { describe, expect, it } from "bun:test";

import {
  buildEntityMemoryNote,
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

describe("buildEntityMemoryNote", () => {
  it("records updated entity ids from confirmed update results", () => {
    const note = buildEntityMemoryNote([
      {
        toolName: "system_update",
        args: { entityType: "base", id: "rizom-note" },
        data: { updated: "rizom-note" },
      },
    ]);

    expect(note).toContain('base "rizom-note" (updated)');
    expect(note).toContain("Reference these IDs directly in follow-ups");
  });

  it("records created entity ids from confirmed create results", () => {
    const note = buildEntityMemoryNote([
      {
        toolName: "system_create",
        args: { entityType: "social-post" },
        data: { entityId: "linkedin-post", status: "generating" },
      },
    ]);

    expect(note).toContain('social-post "linkedin-post" (generating)');
  });

  it("lists every entity created in a turn in a single note", () => {
    // The "save two links" case: two synchronous creates in one turn must both
    // stay addressable so a follow-up like "summarize both pages" can reference
    // them by id instead of searching.
    const note = buildEntityMemoryNote([
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

    expect(note).toContain('link "page-one" (pending)');
    expect(note).toContain('link "page-two" (pending)');
    // Both refs belong to one note, not two separate ones.
    expect(note.match(/Entities affected this turn/g)).toHaveLength(1);
  });

  it("surfaces pending placeholders so they are addressable before enrichment", () => {
    const note = buildEntityMemoryNote([
      {
        toolName: "system_create",
        args: { entityType: "document" },
        data: { entityId: "draft-doc", status: "pending" },
      },
    ]);

    expect(note).toContain('document "draft-doc" (pending)');
  });

  it("does not repeat an entity id touched more than once in a turn", () => {
    const note = buildEntityMemoryNote([
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

    expect(note.match(/page-one/g)).toHaveLength(1);
  });
});
