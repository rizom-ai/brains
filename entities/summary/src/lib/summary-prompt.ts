import type { Message } from "@brains/plugins";
import type { SummaryConfig } from "../schemas/summary";

export interface SummaryPromptInput {
  messages: Message[];
  config: SummaryConfig;
}

function formatMessages(messages: Message[]): string {
  if (messages.length === 0) return "(No messages.)";

  return messages
    .map(
      (message, index) =>
        `${index + 1}. [${message.timestamp}] ${message.role}: ${message.content}`,
    )
    .join("\n");
}

export function buildSummaryExtractionPrompt(
  input: SummaryPromptInput,
): string {
  const { messages, config } = input;
  const optionalSections = [
    config.includeKeyPoints ? "key points" : null,
    config.includeDecisions ? "explicit decisions" : null,
    config.includeActionItems ? "explicit action items" : null,
  ].filter(Boolean);

  return `Summarize this stored conversation into durable, chronological summary entries.

Messages:
${formatMessages(messages)}

Rules:
- Split the conversation into coherent phases or topic shifts.
- Do not split every message into its own entry; merge adjacent short messages when they are part of one request/response phase.
- For low-signal chatter (acknowledgements, "done", "continue"), return at most one minimal entry, or zero entries if there is nothing useful to preserve.
- Keep entries chronological.
- Use startMessageIndex and endMessageIndex to identify the source messages for each entry.
- Cover every meaningful message exactly once when possible.
- Do not invent facts, decisions, owners, or tasks.
- Put recommendations and opinions in keyPoints, not decisions, unless the conversation explicitly accepts or labels them as a decision.
- Keep each summary under ${config.maxEntryLength} characters unless critical context would be lost.
- Return at most ${config.maxEntries} entries.
- Extract ${optionalSections.length > 0 ? optionalSections.join(", ") : "only the summary prose"} when present.

Return JSON with an entries array. Each entry needs:
- title
- summary
- startMessageIndex
- endMessageIndex
- keyPoints
- decisions
- actionItems`;
}
