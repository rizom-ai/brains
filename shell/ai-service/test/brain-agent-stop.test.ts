import { describe, expect, it } from "bun:test";

import { confirmationRequested } from "../src/brain-agent";

describe("BrainAgent stop conditions", () => {
  it("stops the tool loop after a tool requests confirmation", () => {
    const shouldStop = confirmationRequested({
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

  it("does not stop for ordinary successful tool results", () => {
    const shouldStop = confirmationRequested({
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
