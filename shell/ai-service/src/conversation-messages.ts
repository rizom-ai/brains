import type { AgentContextItem } from "@brains/contracts";
import type { Message } from "@brains/conversation-service";
import type { ModelMessage, UserContent } from "ai";
import type { ChatAttachment } from "./agent-types";
import {
  buildEntityMemoryContext,
  entityMemoryRefSchema,
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
              text: msg.content + getEntityMemoryNote(msg.metadata),
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

export interface ConversationUploadContinuitySelection {
  kind: "selected";
  message: string;
  refs: ConversationUploadRef[];
  attachments: ChatAttachment[];
}

export function resolveConversationUploadContinuity(params: {
  message: string;
  currentAttachments: ChatAttachment[];
  historyMessages: Message[];
}): ConversationUploadContinuitySelection {
  const pendingRefs = collectPendingUploadRefs(params.historyMessages);
  const historicalRefs = collectUploadRefsFromMessages(params.historyMessages);
  const refs = selectConversationUploadRefs({
    message: params.message,
    pendingRefs,
    historicalRefs,
    hasCurrentAttachments: params.currentAttachments.length > 0,
  });

  return {
    kind: "selected",
    message: params.message,
    refs,
    attachments: params.currentAttachments,
  };
}

function selectConversationUploadRefs(params: {
  message: string;
  pendingRefs: ConversationUploadRef[];
  historicalRefs: ConversationUploadRef[];
  hasCurrentAttachments: boolean;
}): ConversationUploadRef[] {
  if (params.hasCurrentAttachments) return [];

  const normalized = normalizeUploadReferenceText(params.message);
  const refs = namesKnownFile(normalized, params.historicalRefs)
    ? params.historicalRefs
    : params.pendingRefs.length > 0
      ? params.pendingRefs
      : [];

  return shouldNarrowToLatestUploadRef(params.message, refs)
    ? refs.slice(-1)
    : refs;
}

function collectPendingUploadRefs(
  messages: Message[],
): ConversationUploadRef[] {
  const lastMessage = messages.at(-1);
  if (lastMessage === undefined) return [];

  if (lastMessage.role === "user" && lastMessage.content.trim().length > 0) {
    return collectUploadRefsFromMessages([lastMessage]);
  }

  if (!hasUploadIntentCard(lastMessage)) return [];

  const previousUserMessage = messages
    .slice(0, -1)
    .reverse()
    .find((message) => message.role === "user");

  return previousUserMessage
    ? collectUploadRefsFromMessages([previousUserMessage])
    : [];
}

function hasUploadIntentCard(message: Message): boolean {
  if (message.role !== "assistant") return false;
  const metadata = parseMessageMetadata(message.metadata);
  const cards = metadata?.["cards"];
  if (!Array.isArray(cards)) return false;
  return cards.some((card) => {
    if (!isRecord(card)) return false;
    return card["kind"] === "actions" && card["id"] === "actions:upload-intent";
  });
}

export function shouldHydrateUploadAttachmentsForMessage(
  message: string,
): boolean {
  return !asksToPersistUpload(normalizeUploadReferenceText(message));
}

function shouldNarrowToLatestUploadRef(
  message: string,
  refs: ConversationUploadRef[],
): boolean {
  if (refs.length < 2) return false;
  const normalized = normalizeUploadReferenceText(message);
  return (
    hasSingularUploadReference(normalized) &&
    asksToPersistUpload(normalized) &&
    !namesKnownFile(normalized, refs)
  );
}

function normalizeUploadReferenceText(message: string): string {
  return message.trim().toLowerCase();
}

function hasSingularUploadReference(normalized: string): boolean {
  return /\b(it|this|that|file|upload|image|pdf|document)\b/.test(normalized);
}

function asksToPersistUpload(normalized: string): boolean {
  return /\b(save|store|import|promote|attach|preserve|keep|capture|extract)\b/.test(
    normalized,
  );
}

function namesKnownFile(
  normalized: string,
  refs: ConversationUploadRef[],
): boolean {
  return refs.some((ref) => normalized.includes(ref.filename.toLowerCase()));
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
    return [formatUploadRefLine(ref)];
  });
  if (lines.length === 0) return "";

  const guidance = [
    "Available upload refs from this conversation. These refs are passive context until the user asks to act on an uploaded file. When the user asks to act on an upload, these refs are the source of truth; do not substitute existing entities or retrieved memory with similar titles.",
    'If multiple refs are listed and the user\'s request refers to a single upload with words like "it" or "this", use the most recent matching upload ref only when they explicitly ask to save, import, promote, attach, extract, or otherwise act on the uploaded file itself. Ask which upload to use only when the user explicitly refers to multiple uploads or the intended upload remains unclear.',
    "Raw uploaded file path: when the user explicitly asks to save/import/promote/attach/preserve the uploaded file, PDF, document, image, or attachment itself, call system_upload_save with the selected upload ref. Do not inspect PDF/image bytes before raw file saves; call system_upload_save even when file content is not human-readable in the prompt.",
    'Prior assistant response path: if the previous assistant turn summarized, described, read, or analyzed an uploaded file and the user now says "save it", "save that", "save the note", "save the summary", or asks to save the prior answer without saying upload/file/PDF/document/image/attachment, call system_create with entityType "note" and source: { kind: "prior-response" }. Omit upload sources.',
    'If the user asks to use another source, such as an existing entity, deck carousel, printable, or source attachment, omit upload and use that source instead. For deck carousel or printable PDF previews, call document_generate when available; for save/attach/regenerate/replace requests, call system_create with source: { kind: "attachment", sourceEntityType, sourceEntityId, attachmentType }.',
    "For summarize/describe/read/inspect/analyze requests, answer in chat from the attachment and do not call system_create or system_upload_save unless the user explicitly asks to save/store/create/capture/import/promote/attach the upload or summary.",
    'For markdown/note extraction, call system_create with entityType: "note" and source: { kind: "upload", upload, transform: "extract-markdown" } only for text, JSON, markdown, or PDF uploads when the user asks to extract/import/turn the uploaded file bytes into note, markdown, or text.',
    'Never use an upload source to save an image discussion, image description, caption, interpretation, summary, study notes, or prior assistant answer as a note; use the prior assistant response path instead. For cover-image or generated-image requests, always omit upload and use source: { kind: "generate", prompt } plus target fields when relevant.',
  ].join(" ");

  return `${guidance}\n${lines.join("\n")}`;
}

function formatUploadRefLine(ref: ConversationUploadRef): string {
  const rawSaveEntityType = getRawSaveEntityType(ref.mediaType);
  const parts = [
    `- ${ref.filename}: upload.kind="${ref.source.kind}"`,
    `upload.id="${ref.source.id}"`,
    `mediaType: ${ref.mediaType}`,
  ];

  if (rawSaveEntityType) {
    parts.push(`raw-save entityType="${rawSaveEntityType}"`);
  }

  if (getNoteExtractHint(ref)) {
    parts.push(
      `note-extract args: entityType="note", source.kind="upload", source.upload.kind="${ref.source.kind}", source.upload.id="${ref.source.id}", source.transform="extract-markdown"`,
      "This is the only valid durable note-import operation for this upload; do not copy attachment bytes into a text source for note import.",
    );
  }

  return parts.join("; ");
}

function getRawSaveEntityType(mediaType: string): string | undefined {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType === "application/pdf") return "document";
  return undefined;
}

function getNoteExtractHint(ref: ConversationUploadRef): boolean {
  if (ref.mediaType === "application/pdf") return true;
  if (ref.mediaType.startsWith("text/")) return true;
  const filename = ref.filename.toLowerCase();
  return /\.(md|markdown|txt|json)$/u.test(filename);
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
