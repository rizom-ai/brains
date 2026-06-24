import type { AgentContextItem } from "@brains/contracts";
import { z } from "@brains/utils/zod-v4";
import {
  coerceConversationMetadata,
  type Message,
} from "@brains/conversation-service";
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
              text:
                msg.content +
                getAssistantContentReferentNote(msg) +
                getEntityMemoryNote(msg.metadata),
            },
          ],
        },
  );
}

function getAssistantContentReferentNote(message: Message): string {
  if (message.content.trim().length === 0) return "";
  if (!isSavableAssistantContent(message.metadata)) return "";
  return '\n\nInternal conversation content ref: this assistant response is assistant-written conversation content and is the current savable conversation artifact. Supported durable save operation for this response: call system_create with entityType "note" and content copied from this assistant response. No extra clarification is needed when the operator asks to save this assistant-written content. Do not save this assistant-written response as a document, and do not use upload or transform unless the operator explicitly asks to save/import the raw uploaded file itself.';
}

function isSavableAssistantContent(metadata: Message["metadata"]): boolean {
  const parsedMetadata = parseMessageMetadata(metadata);
  if (parseEntityMemoryRefs(parsedMetadata?.["entityMemoryRefs"]).length > 0) {
    return false;
  }
  const cards = parsedMetadata?.["cards"];
  if (!Array.isArray(cards)) return true;
  return !cards.some((card) => {
    const parsedCard = metadataCardSchema.safeParse(card);
    if (!parsedCard.success) return false;
    if (parsedCard.data.kind === "tool-approval") return true;
    return (
      parsedCard.data.kind === "actions" &&
      parsedCard.data.id === "actions:upload-intent"
    );
  });
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
  return coerceConversationMetadata(metadata);
}

const metadataCardSchema = z.looseObject({
  kind: z.string().optional(),
  id: z.string().optional(),
});

const uploadMetadataSchema = z.looseObject({
  filename: z.string(),
  mediaType: z.string(),
  source: z.looseObject({
    kind: z.string(),
    id: z.string(),
  }),
});

const uploadIntentCardSchema = z.looseObject({
  kind: z.literal("actions"),
  id: z.literal("actions:upload-intent"),
});

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
      const parsed = uploadMetadataSchema.safeParse(attachment);
      if (!parsed.success) continue;
      const { filename, mediaType, source } = parsed.data;
      const key = `${source.kind}:${source.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ filename, mediaType, source });
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
  return cards.some((card) => uploadIntentCardSchema.safeParse(card).success);
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
    const rawSaveEntityType = getRawSaveEntityType(ref.mediaType);
    const noteExtractHint = getNoteExtractHint(ref);
    return [
      `- ${ref.filename}: upload { kind: "${ref.source.kind}", id: "${ref.source.id}" }; mediaType: ${ref.mediaType}${rawSaveEntityType ? `; raw-save entityType: "${rawSaveEntityType}"` : ""}${noteExtractHint ? `; note-extract operation: call system_create with entityType "note", upload { kind: "${ref.source.kind}", id: "${ref.source.id}" }, transform "extract-markdown". This is the only valid durable note-import operation for this upload; do not copy attachment bytes into content for note import.` : ""}`,
    ];
  });
  return lines.length > 0
    ? `Available upload refs from this conversation. These refs are passive context until the user asks to act on an uploaded file. When the user asks to act on an upload, these refs are the source of truth; do not substitute existing entities or retrieved memory with similar titles. If multiple refs are listed and the user's request refers to a single upload with words like "it" or "this", use the most recent matching upload ref only when they explicitly ask to save, import, promote, attach, extract, or otherwise act on the uploaded file itself. Ask which upload to use only when the user explicitly refers to multiple uploads or the intended upload remains unclear. If the previous assistant turn summarized, described, read, or analyzed an uploaded file and the user now says "save it", "save that", "save the note", or "save the summary" without saying upload/file/PDF/document, save the visible assistant summary/notes as a note with content from the conversation; do not use upload or transform. If the user asks to use another source, such as an existing entity, deck carousel, printable, or source attachment, omit upload and use that source instead. For deck carousel or printable PDF previews, call document_generate when available; for save/attach/regenerate/replace requests, call system_create with sourceAttachment. Do not try to inspect PDF/image bytes before raw file saves; call system_upload_save with the selected upload ref even when the file content is not human-readable in the prompt. For raw file saves/promotions, call system_upload_save with upload: { kind: "upload", id: <upload ID> }. For summarize/describe/read/inspect/analyze requests, answer in chat from the attachment and do not call system_create or system_upload_save unless the user explicitly asks to save/store/create/capture/import/promote/attach the upload or summary. For markdown/note extraction, call system_create with entityType: "note", upload, and transform: "extract-markdown" only for text, JSON, markdown, or PDF uploads when the user asks to extract/import/turn the uploaded file bytes into note, markdown, or text. Never use upload or transform to save an image discussion, image description, caption, interpretation, summary, study notes, or prior assistant answer as a note; create a note entity with content from the conversation instead. For cover-image or generated-image requests, always omit upload and use prompt plus target fields when relevant.\n${lines.join("\n")}`
    : "";
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
