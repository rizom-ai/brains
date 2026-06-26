import type { AgentContextItem } from "@brains/contracts";
import type { Message } from "@brains/conversation-service";
import type { ModelMessage, UserContent } from "ai";
import type { ChatAttachment } from "./agent-types";
import {
  agentContactCandidateSchema,
  buildAgentContactCandidateContext,
  buildEntityMemoryContext,
  entityMemoryRefSchema,
  type AgentContactCandidate,
  type EntityMemoryRef,
} from "./agent-results";

export function toModelMessages(messages: Message[]): ModelMessage[] {
  return messages.map((msg) =>
    msg.role === "user"
      ? { role: "user", content: msg.content }
      : {
          role: "assistant",
          content: [
            {
              type: "text",
              text:
                msg.content +
                getEntityMemoryNote(msg.metadata) +
                getAgentContactCandidateNote(msg.metadata),
            },
          ],
        },
  );
}

function getEntityMemoryNote(metadata: Message["metadata"]): string {
  const parsedMetadata = parseMessageMetadata(metadata);
  const refs = parseEntityMemoryRefs(parsedMetadata?.["entityMemoryRefs"]);
  return buildEntityMemoryContext(refs);
}

function getAgentContactCandidateNote(metadata: Message["metadata"]): string {
  const parsedMetadata = parseMessageMetadata(metadata);
  const candidates = parseAgentContactCandidates(
    parsedMetadata?.["agentContactCandidates"],
  );
  return buildAgentContactCandidateContext(candidates);
}

function parseAgentContactCandidates(value: unknown): AgentContactCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AgentContactCandidate[] => {
    const parsed = agentContactCandidateSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseEntityMemoryRefs(value: unknown): EntityMemoryRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): EntityMemoryRef[] => {
    const parsed = entityMemoryRefSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseMessageMetadata(
  metadata: Message["metadata"],
): Record<string, unknown> | null {
  if (isRecord(metadata)) return metadata;
  if (typeof metadata !== "string") return null;
  try {
    const parsed = JSON.parse(metadata) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildModelMessages(
  historyMessages: Message[],
  userMessage: UserContent,
): ModelMessage[] {
  return [
    ...toModelMessages(historyMessages),
    { role: "user", content: userMessage },
  ];
}

export interface ConversationUploadRef {
  filename: string;
  mediaType: string;
  source: {
    kind: string;
    id: string;
  };
}

export function collectUploadRefsFromMessages(
  messages: Message[],
): ConversationUploadRef[] {
  const refs: ConversationUploadRef[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    const metadata = parseMessageMetadata(message.metadata);
    const attachments = metadata?.["attachments"];
    if (!Array.isArray(attachments)) continue;
    for (const attachment of attachments) {
      if (!isRecord(attachment)) continue;
      const source = attachment["source"];
      if (!isRecord(source)) continue;
      const kind = source["kind"];
      const id = source["id"];
      const filename = attachment["filename"];
      const mediaType = attachment["mediaType"];
      if (
        typeof kind !== "string" ||
        typeof id !== "string" ||
        typeof filename !== "string" ||
        typeof mediaType !== "string"
      ) {
        continue;
      }
      const key = `${kind}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ filename, mediaType, source: { kind, id } });
    }
  }
  return refs;
}

export interface ConversationPriorResponseRef {
  messageId: string;
}

export interface ConversationUploadContinuitySelection {
  kind: "selected";
  message: string;
  refs: ConversationUploadRef[];
  attachments: ChatAttachment[];
  priorResponseRef?: ConversationPriorResponseRef;
}

const MAX_HISTORICAL_UPLOAD_REFS = 6;

export function resolveConversationUploadContinuity(params: {
  message: string;
  currentAttachments: ChatAttachment[];
  historyMessages: Message[];
}): ConversationUploadContinuitySelection {
  const refs = selectConversationUploadRefs({
    currentAttachments: params.currentAttachments,
    historyMessages: params.historyMessages,
  });

  const priorResponseRef =
    refs.length > 0
      ? selectPriorResponseRef(params.historyMessages)
      : undefined;

  return {
    kind: "selected",
    message: params.message,
    refs,
    attachments: params.currentAttachments,
    ...(priorResponseRef ? { priorResponseRef } : {}),
  };
}

function selectConversationUploadRefs(params: {
  currentAttachments: ChatAttachment[];
  historyMessages: Message[];
}): ConversationUploadRef[] {
  const currentRefs = params.currentAttachments.flatMap((attachment) =>
    attachment.source === undefined
      ? []
      : [
          {
            filename: attachment.filename,
            mediaType: attachment.mediaType,
            source: attachment.source,
          },
        ],
  );
  const historicalRefs = collectUploadRefsFromMessages(params.historyMessages)
    .slice(-MAX_HISTORICAL_UPLOAD_REFS)
    .reverse();

  return dedupeUploadRefs([...currentRefs, ...historicalRefs]);
}

function dedupeUploadRefs(
  refs: ConversationUploadRef[],
): ConversationUploadRef[] {
  const seen = new Set<string>();
  const deduped: ConversationUploadRef[] = [];
  for (const ref of refs) {
    const key = `${ref.source.kind}:${ref.source.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(ref);
  }
  return deduped;
}

function selectPriorResponseRef(
  messages: Message[],
): ConversationPriorResponseRef | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    if (message.content.trim().length === 0) continue;
    if (hasEntityMemoryRefs(message)) continue;
    if (hasActionCard(message)) continue;
    return { messageId: message.id };
  }
  return undefined;
}

function hasEntityMemoryRefs(message: Message): boolean {
  const metadata = parseMessageMetadata(message.metadata);
  return Array.isArray(metadata?.["entityMemoryRefs"]);
}

function hasActionCard(message: Message): boolean {
  const metadata = parseMessageMetadata(message.metadata);
  const cards = metadata?.["cards"];
  if (!Array.isArray(cards)) return false;
  return cards.some((card) => isRecord(card) && card["kind"] === "actions");
}

export function buildMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  options: {
    uploadRefs?: ConversationUploadRef[];
    priorResponseRef?: ConversationPriorResponseRef;
  } = {},
): UserContent {
  const nativeAttachments = attachments ?? [];
  const textAttachments = nativeAttachments
    .filter((attachment) => attachment.kind === "text")
    .map(formatTextAttachment);
  const text = [
    message,
    ...textAttachments,
    formatUploadRefs(
      nativeAttachments,
      options.uploadRefs ?? [],
      options.priorResponseRef,
    ),
  ]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join("\n\n");
  const fileAttachments = nativeAttachments.filter(
    (attachment) => attachment.kind === "file",
  );

  if (fileAttachments.length === 0) return text;

  return [
    ...(text.length > 0 ? [{ type: "text" as const, text }] : []),
    ...fileAttachments.map((attachment) => ({
      type: "file" as const,
      data: attachment.data,
      mediaType: attachment.mediaType,
      filename: attachment.filename,
    })),
  ];
}

function formatTextAttachment(
  attachment: Extract<ChatAttachment, { kind: "text" }>,
): string {
  return `User uploaded a file "${attachment.filename}":\n\n${attachment.content}`;
}

function formatUploadRefs(
  attachments: ChatAttachment[],
  uploadRefs: ConversationUploadRef[],
  priorResponseRef: ConversationPriorResponseRef | undefined,
): string {
  const refs = [
    ...uploadRefs,
    ...attachments.flatMap((attachment) =>
      attachment.source === undefined
        ? []
        : [
            {
              filename: attachment.filename,
              mediaType: attachment.mediaType,
              source: attachment.source,
            },
          ],
    ),
  ];
  const seen = new Set<string>();
  const lines = refs.flatMap((ref) => {
    const key = `${ref.source.kind}:${ref.source.id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [formatUploadRefLine(ref)];
  });
  const priorResponseCandidate = priorResponseRef
    ? [
        "Available system_create candidate for saving the prior assistant response (call without confirmed to request confirmation):",
        `{ entityType: "note", source: { kind: "prior-response", messageId: "${priorResponseRef.messageId}" } }`,
      ].join(" ")
    : "";
  if (lines.length === 0) return priorResponseCandidate;

  const guidance =
    "Available upload refs from this conversation. Treat this as structured candidate data; resolve any user reference to a specific upload in typed tool arguments, or ask a clarification if the candidates are insufficient. Upload candidates are file bytes; previous assistant answers are saved separately.";

  return [guidance, priorResponseCandidate, ...lines]
    .filter((line) => line.length > 0)
    .join("\n");
}

function formatUploadRefLine(ref: ConversationUploadRef): string {
  return [
    `- ${ref.filename}`,
    `upload: { kind: "${ref.source.kind}", id: "${ref.source.id}" }`,
    `mediaType: ${ref.mediaType}`,
  ].join("; ");
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
