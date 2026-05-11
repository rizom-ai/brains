import {
  conversationMessageMetadataSchema,
  type ConversationMessageActor,
} from "@brains/conversation-service";
import type { Message } from "@brains/plugins";
import type { SummaryConfig } from "../schemas/summary";

export interface SummaryPromptInput {
  messages: Message[];
  config: SummaryConfig;
}

export interface SummaryProjectionDecisionPromptInput {
  existingSummary?: string | undefined;
  messages: Message[];
}

function getMessageActor(
  message: Message,
): ConversationMessageActor | undefined {
  const parsed = conversationMessageMetadataSchema.safeParse(message.metadata);
  return parsed.success ? parsed.data.actor : undefined;
}

function firstNonEmpty(values: string[]): string | undefined {
  return values.map((value) => value.trim()).find((value) => value.length > 0);
}

function getSpeakerLabel(message: Message): string {
  const actor = getMessageActor(message);
  if (!actor) return message.role;

  const label =
    firstNonEmpty([
      actor.displayName ?? "",
      actor.username ?? "",
      actor.actorId,
    ]) ?? message.role;

  return `${label} [${message.role}]`;
}

function formatMessages(messages: Message[]): string {
  if (messages.length === 0) return "(No messages.)";

  return messages
    .map(
      (message, index) =>
        `${index + 1}. [${message.timestamp}] ${getSpeakerLabel(message)}: ${message.content}`,
    )
    .join("\n");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n...(truncated)`;
}

export function buildSummaryProjectionDecisionPrompt(
  input: SummaryProjectionDecisionPromptInput,
): string {
  const existingSummary = input.existingSummary?.trim();

  return `Decide how to project durable conversation memory.

Existing summary:
${existingSummary ? truncate(existingSummary, 4000) : "(No existing summary.)"}

New or changed messages:
${formatMessages(input.messages)}

Rules:
- Return "skip" when the new messages are only low-signal chatter, acknowledgements, retries, or do not add durable memory.
- Return "append" when the new messages add durable facts, decisions, or action items that can be added after the existing summary without rewriting older entries.
- Return "update" when there is no existing summary, when older entries must be corrected, or when the new messages contradict or substantially reframe prior memory.
- Do not summarize in this step; only decide.

Return JSON with:
- decision: "skip", "update", or "append"
- rationale: brief reason`;
}

export function buildSummaryExtractionPrompt(
  input: SummaryPromptInput,
): string {
  const { messages, config } = input;

  return `Extract durable conversation memory from this stored conversation.

Messages:
${formatMessages(messages)}

Rules:
- Split the conversation into coherent phases or topic shifts.
- Create separate entries when the conversation moves to a distinct task, artifact, or decision area, even if each phase is short.
- Do not split every message into its own entry; merge adjacent short messages when they are part of one request/response phase.
- For low-signal chatter (acknowledgements, "done", "continue"), return at most one minimal entry, or zero entries if there is nothing useful to preserve.
- Keep entries chronological.
- Use startMessageIndex and endMessageIndex to identify the source messages for each entry.
- Cover every meaningful message exactly once when possible.
- Do not invent facts, decisions, owners, or tasks.
- When message labels identify distinct speakers, preserve those speaker names for attributed decisions, commitments, and action items; do not infer owners from proximity alone.
- If a labeled user message declares a decision, write the decision with that speaker as the decider (for example, "Mira decided ..."). If a labeled user makes a first-person commitment, write the action item with that speaker as the owner (for example, "Daniel will ...").
- Treat explicit user requests, instructions, and named ownership assignments for future work as action items. For "Alice owns the adapter rewrite", extract an action item owned by Alice; do not classify ownership assignments as decisions unless they are explicitly framed as decisions.
- For delegated work, keep assignee and requester distinct in wording: if Mira asks Daniel to update a checklist and Daniel accepts, write "Daniel will update the checklist" rather than "Mira will update...".
- Treat system/developer messages as constraints or context, not as user decisions or action items. Preserve relevant system/developer constraints in the summary or keyPoints when they materially shape the conversation, but do not copy them into decisions unless a user explicitly adopts them as a decision.
- Put recommendations and opinions in keyPoints, not decisions, unless the conversation explicitly accepts or labels them as a decision.
- Keep each summary under ${config.maxEntryLength} characters unless critical context would be lost.
- Return at most ${config.maxEntries} entries.
- Extract explicit decisions and explicit action items for separate derived entities. Do not put recommendations in decisions unless the conversation explicitly accepts or labels them as decisions.

Return JSON with an entries array. Each entry needs:
- title
- summary
- startMessageIndex
- endMessageIndex
- keyPoints
- decisions: explicit decisions from this entry for separate decision entities
- actionItems: explicit action items from this entry for separate action-item entities`;
}
