import type { AgentContextItem } from "@brains/contracts";
import type { Message } from "@brains/conversation-service";
import type { ModelMessage } from "ai";

export function toModelMessages(messages: Message[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role === "user") {
      return { role: "user", content: msg.content };
    }
    return {
      role: "assistant",
      content: [
        {
          type: "text",
          text:
            msg.role === "system"
              ? `[Prior system note]\n${msg.content}`
              : msg.content,
        },
      ],
    };
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

export function buildAgentContextInstructions(
  contextItems: AgentContextItem[] | undefined,
): string | undefined {
  if (contextItems === undefined) return undefined;
  return contextItems.length === 0
    ? formatNoAgentContext()
    : formatAgentContext(contextItems);
}

function formatNoAgentContext(): string {
  return "No relevant conversation memory was retrieved for this turn. If the user asks about conversation memory available in this turn, say none was retrieved rather than inferring from general instructions or other background knowledge.";
}

function formatAgentContext(contextItems: AgentContextItem[]): string {
  const formattedItems = contextItems
    .map((item, index) => formatAgentContextItem(item, index))
    .join("\n\n");

  return [
    "Relevant conversation memory retrieved for this turn.",
    'Use it only when it helps answer the user. If the user asks what conversation memory says, explicitly ground the answer in the retrieved memory (for example, "According to conversation memory...") rather than general background knowledge. Preserve source/provenance when referencing memory. Ignore unrelated memory; when memory conflicts, prefer the most specific or newest source and mention uncertainty if the conflict remains unresolved.',
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
