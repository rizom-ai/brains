import { describe, expect, it } from "bun:test";
import {
  formatToolStatusLabel,
  getToolStatusDisplay,
  getToolStatusFallbackPrefix,
  getToolStatusKey,
  getToolStatusTitle,
  responseHasPendingConfirmationForTool,
  toToolStatusUpdate,
} from "../../src/message-interface/tool-status";

describe("tool status helpers", () => {
  it("derives a stable status key", () => {
    expect(
      getToolStatusKey({
        conversationId: "conv-1",
        toolName: "system_create",
        interfaceType: "discord",
        state: "running",
      }),
    ).toBe("conv-1:system_create");
  });

  it("formats tool labels", () => {
    expect(formatToolStatusLabel("system_create-note")).toBe(
      "system create note",
    );
  });

  it("maps statuses to titles and fallback prefixes", () => {
    expect(getToolStatusTitle("running")).toBe("Tool running");
    expect(getToolStatusTitle("completed")).toBe("Tool completed");
    expect(getToolStatusTitle("awaiting-approval")).toBe("Approval required");
    expect(getToolStatusTitle("failed")).toBe("Tool failed");

    expect(getToolStatusFallbackPrefix("awaiting-approval")).toBe(
      "Tool awaiting approval",
    );
  });

  it("builds display text including errors", () => {
    expect(
      getToolStatusDisplay({
        conversationId: "conv-1",
        toolName: "system_create",
        interfaceType: "discord",
        state: "failed",
        error: "Denied",
      }),
    ).toEqual({
      key: "conv-1:system_create",
      label: "system create",
      title: "Tool failed",
      fallbackPrefix: "Tool failed",
      fallback: "Tool failed: system create: Denied",
    });
  });

  it("converts tool activity events into status updates", () => {
    expect(
      toToolStatusUpdate(
        {
          type: "tool:invoking",
          toolName: "system_create",
          conversationId: "conv-1",
          interfaceType: "discord",
          channelId: "channel-1",
          channelName: "General",
        },
        "running",
      ),
    ).toEqual({
      state: "running",
      toolName: "system_create",
      conversationId: "conv-1",
      interfaceType: "discord",
      channelId: "channel-1",
      channelName: "General",
    });
  });

  it("detects pending confirmations for a tool", () => {
    expect(
      responseHasPendingConfirmationForTool(
        {
          pendingConfirmations: [
            {
              id: "approval:call-1",
              toolName: "system_publish",
              summary: "Publish",
              args: {},
            },
          ],
        },
        "system_publish",
      ),
    ).toBe(true);
  });
});
