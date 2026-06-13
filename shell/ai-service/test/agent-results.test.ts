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
});
