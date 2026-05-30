import type { AgentContextItem } from "@brains/contracts";
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
  contextItems: AgentContextItem[] = [],
): ModelMessage[] {
  return [
    ...toModelMessages(historyMessages),
    ...buildAgentContextMessages(contextItems),
    { role: "user", content: userMessage },
  ];
}

function buildAgentContextMessages(
  contextItems: AgentContextItem[],
): ModelMessage[] {
  if (contextItems.length === 0) return [];

  return [
    {
      role: "system",
      content: formatAgentContext(contextItems),
    },
  ];
}

function formatAgentContext(contextItems: AgentContextItem[]): string {
  const formattedItems = contextItems
    .map((item, index) => formatAgentContextItem(item, index))
    .join("\n\n");

  return [
    "Relevant conversation memory retrieved for this turn.",
    "Use it only when it helps answer the user. Preserve source/provenance when referencing memory, and ignore unrelated or conflicting memory.",
    "",
    formattedItems,
  ].join("\n");
}

function formatAgentContextItem(item: AgentContextItem, index: number): string {
  const label = item.title ?? item.id;
  const provenance = formatProvenance(item.provenance);
  return [
    `${index + 1}. ${label} [${item.source}]`,
    item.content.trim(),
    ...(provenance ? [`Provenance: ${provenance}`] : []),
  ].join("\n");
}

function formatProvenance(
  provenance: AgentContextItem["provenance"],
): string | undefined {
  if (!provenance) return undefined;

  const entries = Object.entries(provenance)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    )
    .map(([key, value]) => `${key}=${formatProvenanceValue(value)}`);

  return entries.length > 0 ? entries.join(", ") : undefined;
}

function formatProvenanceValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
