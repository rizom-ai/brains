import type { AgentContextItem } from "@brains/contracts";
import type { Message } from "@brains/conversation-service";
import type { ModelMessage, UserContent } from "ai";
import type { ChatAttachment } from "./agent-types";

export function toModelMessages(messages: Message[]): ModelMessage[] {
  return messages.map((msg) =>
    msg.role === "user"
      ? { role: "user", content: msg.content }
      : {
          role: "assistant",
          content: [
            {
              type: "text",
              text: msg.content + getEntityMemoryNote(msg.metadata),
            },
          ],
        },
  );
}

function getEntityMemoryNote(metadata: Message["metadata"]): string {
  const parsedMetadata = parseMessageMetadata(metadata);
  const value = parsedMetadata?.["entityMemoryNote"];
  return typeof value === "string" ? value : "";
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

export type ConversationUploadRefResolution =
  | { kind: "selected"; refs: ConversationUploadRef[] }
  | { kind: "clarify"; refs: ConversationUploadRef[] };

export function resolveConversationUploadRefs(
  message: string,
  uploadRefs: ConversationUploadRef[],
): ConversationUploadRefResolution {
  if (uploadRefs.length <= 1) {
    return { kind: "selected", refs: uploadRefs };
  }

  const normalized = message.toLowerCase();
  const named = uploadRefs.filter((ref) =>
    normalized.includes(ref.filename.toLowerCase()),
  );
  if (named.length > 0) return { kind: "selected", refs: named };

  if (/\b(first|oldest|earliest)\b/.test(normalized)) {
    return { kind: "selected", refs: uploadRefs.slice(0, 1) };
  }
  if (/\b(latest|newest|most recent|last)\b/.test(normalized)) {
    return { kind: "selected", refs: uploadRefs.slice(-1) };
  }

  return { kind: "clarify", refs: uploadRefs };
}

export function buildMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  options: { uploadRefs?: ConversationUploadRef[] } = {},
): UserContent {
  const nativeAttachments = attachments ?? [];
  const textAttachments = nativeAttachments
    .filter((attachment) => attachment.kind === "text")
    .map(formatTextAttachment);
  const text = [
    message,
    ...textAttachments,
    formatUploadRefs(nativeAttachments, options.uploadRefs ?? []),
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
    return [
      `- ${ref.filename}: upload { kind: "${ref.source.kind}", id: "${ref.source.id}" }${formatUploadRefUsage(ref.mediaType)}`,
    ];
  });
  return lines.length > 0
    ? `Available runtime upload refs from this conversation. When the user asks to act on the upload, these refs are the source of truth; do not substitute existing entities or retrieved memory with similar titles. For raw file saves/promotions, call system_create with upload: { kind: "web-chat-upload", id: <upload ID> } and the appropriate entityType (PDF -> document, image -> image). If the request names document, PDF, file, image, save, or promote, use raw promotion and omit transform. For markdown/note extraction, call system_create with entityType: "base", upload, and transform: "extract-markdown" only when the request names note, markdown, or text extraction.\n${lines.join("\n")}`
    : "";
}

function formatUploadRefUsage(mediaType: string): string {
  if (mediaType === "application/pdf") {
    return '; raw promotion call: system_create({ entityType: "document", upload }) and omit transform';
  }
  if (mediaType.startsWith("image/")) {
    return '; raw promotion call: system_create({ entityType: "image", upload }) and omit transform';
  }
  if (mediaType.startsWith("text/") || mediaType === "application/json") {
    return '; markdown/note extraction call: system_create({ entityType: "base", upload, transform: "extract-markdown" })';
  }
  return "";
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
