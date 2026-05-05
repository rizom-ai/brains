import type { Message } from "@brains/conversation-service";
import type { ModelMessage } from "ai";

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

export function buildModelMessages(
  historyMessages: Message[],
  userMessage: string,
): ModelMessage[] {
  return [
    ...toModelMessages(historyMessages),
    { role: "user", content: userMessage },
  ];
}
