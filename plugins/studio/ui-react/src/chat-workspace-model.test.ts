import { describe, expect, it } from "bun:test";
import {
  chatProtocolEventSchema,
  type ChatProtocolEvent,
} from "@brains/contracts/chat";
import {
  approvalResponseMessage,
  createStudioChatStreamState,
  reduceStudioChatStream,
  streamAssistantMessage,
} from "./chat-workspace-model";

function event(value: unknown): ChatProtocolEvent {
  return chatProtocolEventSchema.parse(value);
}

describe("private Studio Chat presentation model", () => {
  it("assembles raw protocol facts only inside Studio", () => {
    const state = [
      event({ type: "start", messageId: "assistant-1" }),
      event({ type: "text-start", id: "text-1" }),
      event({ type: "text-delta", id: "text-1", delta: "Durable " }),
      event({ type: "text-delta", id: "text-1", delta: "work." }),
      event({
        type: "data-actions",
        id: "actions-1",
        data: {
          kind: "actions",
          id: "actions-1",
          title: "Next",
          actions: [
            {
              type: "prompt",
              id: "prompt-1",
              label: "Draft brief",
              prompt: "Draft a brief",
            },
          ],
        },
      }),
      event({ type: "finish", finishReason: "stop" }),
    ].reduce(reduceStudioChatStream, createStudioChatStreamState());

    expect(state.text).toBe("Durable work.");
    expect(state.cards).toHaveLength(1);
    expect(state.finished).toBe(true);
    expect(streamAssistantMessage(state)).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      content: "Durable work.",
    });
  });

  it("keeps approval assembly in the private Studio model", () => {
    const state = [
      event({
        type: "tool-input-available",
        toolCallId: "tool-1",
        toolName: "publish_post",
        input: { id: "post-1" },
        title: "Publish post",
      }),
      event({
        type: "tool-approval-request",
        approvalId: "approval-1",
        toolCallId: "tool-1",
      }),
    ].reduce(reduceStudioChatStream, createStudioChatStreamState());

    expect(state.approvals).toEqual([
      {
        approvalId: "approval-1",
        toolCallId: "tool-1",
        toolName: "publish_post",
        input: { id: "post-1" },
        title: "Publish post",
      },
    ]);
    const approval = state.approvals[0];
    if (!approval) throw new Error("Missing assembled approval");
    expect(approvalResponseMessage(approval, true)).toEqual({
      role: "assistant",
      parts: [
        {
          state: "approval-responded",
          toolCallId: "tool-1",
          toolName: "publish_post",
          input: { id: "post-1" },
          title: "Publish post",
          approval: {
            id: "approval-1",
            approved: true,
            toolCallId: "tool-1",
            toolName: "publish_post",
            input: { id: "post-1" },
            title: "Publish post",
          },
        },
      ],
    });
  });
});
