import type { Message } from "@brains/conversation-service";
import type { ModelMessage } from "ai";

/**
 * Convert stored conversation messages to AI SDK model messages.
 */
export function toModelMessages(messages: Message[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role === "user") {
      return { role: "user", content: msg.content };
    }
    if (msg.role === "assistant") {
      return {
        role: "assistant",
        content: [{ type: "text", text: msg.content }],
      };
    }
    return { role: "system", content: msg.content };
  });
}

/**
 * Convert history and append the pending user message for a new agent call.
 */
export function buildModelMessages(
  historyMessages: Message[],
  userMessage: string,
): ModelMessage[] {
  return [
    ...toModelMessages(historyMessages),
    { role: "user", content: userMessage },
  ];
}
