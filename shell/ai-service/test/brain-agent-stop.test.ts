import { describe, expect, it } from "bun:test";

import { shouldStopToolLoop } from "../src/brain-agent";

describe("BrainAgent stop conditions", () => {
  it("stops the tool loop after a tool requests confirmation", () => {
    const shouldStop = shouldStopToolLoop({
      steps: [
        {
          toolResults: [
            {
              toolCallId: "call-1",
              toolName: "system_update",
              output: {
                needsConfirmation: true,
                toolName: "system_update",
                summary: 'Update "Untitled"?',
                args: { entityType: "base", id: "untitled" },
              },
            },
          ],
        },
      ],
    });

    expect(shouldStop).toBe(true);
  });

  it("stops the tool loop after starting a playbook", () => {
    const shouldStop = shouldStopToolLoop({
      steps: [
        {
          toolResults: [
            {
              toolCallId: "call-1",
              toolName: "playbook_start",
              output: {
                success: true,
                data: {
                  activeRun: { id: "run-1", currentState: "welcome" },
                  cards: [
                    {
                      kind: "actions",
                      id: "actions:playbook:run-1",
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
      ],
    });

    expect(shouldStop).toBe(true);
  });

  it("does not stop for ordinary successful tool results", () => {
    const shouldStop = shouldStopToolLoop({
      steps: [
        {
          toolResults: [
            {
              toolCallId: "call-1",
              toolName: "system_create",
              output: { success: true, data: { entityId: "note-1" } },
            },
          ],
        },
      ],
    });

    expect(shouldStop).toBe(false);
  });
});
