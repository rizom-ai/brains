import type { AgentContextItem } from "@brains/contracts";
import type { Message } from "@brains/conversation-service";
import type { UserPermissionLevel } from "@brains/templates";
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
import { isRecord } from "@brains/utils/is-record";
import { z } from "@brains/utils/zod";

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
    const parsed: unknown = JSON.parse(metadata);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const PERMISSION_RANK: Record<UserPermissionLevel, number> = {
  public: 0,
  trusted: 1,
  admin: 2,
};

/**
 * Keep model history within the current caller's permission scope.
 * Legacy messages have no provenance, so only admins may receive them.
 */
export function filterConversationHistoryForPermission(
  messages: Message[],
  currentLevel: UserPermissionLevel,
): Message[] {
  if (currentLevel === "admin") return messages;

  return messages.filter((message) => {
    const metadata = parseMessageMetadata(message.metadata);
    const storedLevel = metadata?.["userPermissionLevel"];
    if (
      storedLevel !== "public" &&
      storedLevel !== "trusted" &&
      storedLevel !== "admin"
    ) {
      return false;
    }
    return PERMISSION_RANK[storedLevel] <= PERMISSION_RANK[currentLevel];
  });
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
  /** The entity a confirmed save in this conversation made of the upload. */
  savedAs?: { entityType: string; entityId: string };
}

const uploadSourceRefSchema = z.object({ kind: z.string(), id: z.string() });

/** A confirmed system_create whose source was one or several uploads. */
const savedUploadCardSchema = z.looseObject({
  kind: z.literal("tool-approval"),
  toolName: z.literal("system_create"),
  state: z.literal("output-available"),
  input: z.looseObject({
    entityType: z.string(),
    source: z.union([
      z.looseObject({
        kind: z.literal("upload"),
        upload: uploadSourceRefSchema,
      }),
      z.looseObject({
        kind: z.literal("uploads"),
        items: z.array(z.looseObject({ upload: uploadSourceRefSchema })),
      }),
    ]),
  }),
  output: z.looseObject({
    success: z.literal(true),
    data: z.looseObject({
      entityId: z.string().optional(),
      items: z
        .array(z.looseObject({ entityType: z.string(), entityId: z.string() }))
        .optional(),
    }),
  }),
});

type SavedUploads = Map<string, NonNullable<ConversationUploadRef["savedAs"]>>;

/** Every upload a confirmed save in these messages made an entity of. */
function collectSavedUploads(messages: Message[]): SavedUploads {
  const saved: SavedUploads = new Map();
  for (const message of messages) {
    const cards = parseMessageMetadata(message.metadata)?.["cards"];
    if (!Array.isArray(cards)) continue;
    for (const card of cards) {
      const parsed = savedUploadCardSchema.safeParse(card);
      if (!parsed.success) continue;
      const { input, output } = parsed.data;
      if (input.source.kind === "upload") {
        const { entityId } = output.data;
        if (entityId === undefined) continue;
        saved.set(`${input.source.upload.kind}:${input.source.upload.id}`, {
          entityType: input.entityType,
          entityId,
        });
        continue;
      }
      // A save of several uploads lists its entities in the order of its files.
      input.source.items.forEach((item, index) => {
        const entity = output.data.items?.[index];
        if (!entity) return;
        saved.set(`${item.upload.kind}:${item.upload.id}`, {
          entityType: entity.entityType,
          entityId: entity.entityId,
        });
      });
    }
  }
  return saved;
}

function uploadRefKey(ref: ConversationUploadRef): string {
  return `${ref.source.kind}:${ref.source.id}`;
}

/** Map a typed in-memory attachment to an upload ref (null if it has no source). */
function chatAttachmentToRef(
  attachment: ChatAttachment,
): ConversationUploadRef | null {
  if (attachment.source === undefined) return null;
  return {
    filename: attachment.filename,
    mediaType: attachment.mediaType,
    source: attachment.source,
  };
}

/** Parse a raw stored-metadata attachment record into an upload ref, or null. */
function parseStoredAttachmentRef(
  value: unknown,
): ConversationUploadRef | null {
  if (!isRecord(value)) return null;
  const source = value["source"];
  if (!isRecord(source)) return null;
  const kind = source["kind"];
  const id = source["id"];
  const filename = value["filename"];
  const mediaType = value["mediaType"];
  if (
    typeof kind !== "string" ||
    typeof id !== "string" ||
    typeof filename !== "string" ||
    typeof mediaType !== "string"
  ) {
    return null;
  }
  return { filename, mediaType, source: { kind, id } };
}

function isUploadRef(
  ref: ConversationUploadRef | null,
): ref is ConversationUploadRef {
  return ref !== null;
}

export function collectUploadRefsFromMessages(
  messages: Message[],
): ConversationUploadRef[] {
  const refs = messages.flatMap((message) => {
    const metadata = parseMessageMetadata(message.metadata);
    const attachments = metadata?.["attachments"];
    if (!Array.isArray(attachments)) return [];
    return attachments.map(parseStoredAttachmentRef).filter(isUploadRef);
  });
  return dedupeUploadRefs(refs);
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
  const savedUploads = collectSavedUploads(params.historyMessages);
  const refs = selectConversationUploadRefs({
    message: params.message,
    currentAttachments: params.currentAttachments,
    historyMessages: params.historyMessages,
  }).map((ref) => {
    const savedAs = savedUploads.get(uploadRefKey(ref));
    return savedAs ? { ...ref, savedAs } : ref;
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
  message: string;
  currentAttachments: ChatAttachment[];
  historyMessages: Message[];
}): ConversationUploadRef[] {
  const currentRefs = params.currentAttachments
    .map(chatAttachmentToRef)
    .filter(isUploadRef);
  const historicalRefs = collectUploadRefsFromMessages(params.historyMessages)
    .slice(-MAX_HISTORICAL_UPLOAD_REFS)
    .reverse();
  const refs = dedupeUploadRefs([...currentRefs, ...historicalRefs]);
  const mediaKind = referencedUploadMediaKind(params.message);
  if (mediaKind === undefined) return refs;
  return refs
    .filter((ref) => uploadRefMatchesMediaKind(ref, mediaKind))
    .slice(0, 1);
}

function referencedUploadMediaKind(
  message: string,
): "image" | "pdf" | undefined {
  const normalized = message.toLowerCase();
  if (normalized.includes("uploaded image")) return "image";
  if (normalized.includes("uploaded pdf")) return "pdf";
  return undefined;
}

function uploadRefMatchesMediaKind(
  ref: ConversationUploadRef,
  mediaKind: "image" | "pdf",
): boolean {
  if (mediaKind === "image") return ref.mediaType.startsWith("image/");
  return ref.mediaType === "application/pdf";
}

function dedupeUploadRefs(
  refs: ConversationUploadRef[],
): ConversationUploadRef[] {
  const seen = new Set<string>();
  const deduped: ConversationUploadRef[] = [];
  for (const ref of refs) {
    const key = uploadRefKey(ref);
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

/**
 * Several files attached to one message are kept together: the candidate
 * names every one of them, each with the transform that keeps it as itself
 * (a text file as a note), so none is left out of a request to keep them.
 */
function formatKeepAllCandidate(attachments: ChatAttachment[]): string {
  const items = attachments.flatMap((attachment) =>
    attachment.source
      ? [
          `{ upload: { kind: "${attachment.source.kind}", id: "${attachment.source.id}" }, transform: "${attachment.kind === "text" ? "extract-markdown" : "preserve"}" }`,
        ]
      : [],
  );
  if (items.length < 2) return "";
  return `Available system_create candidate for keeping every file attached to this message, each as itself and text files as notes (call without confirmed to request confirmation): { entityType: "note", source: { kind: "uploads", items: [${items.join(", ")}] } }`;
}

function formatUploadRefs(
  attachments: ChatAttachment[],
  uploadRefs: ConversationUploadRef[],
  priorResponseRef: ConversationPriorResponseRef | undefined,
): string {
  const attachmentRefs = attachments
    .map(chatAttachmentToRef)
    .filter(isUploadRef);
  const lines = dedupeUploadRefs([...uploadRefs, ...attachmentRefs]).map(
    formatUploadRefLine,
  );
  const priorResponseCandidate = priorResponseRef
    ? [
        'Available system_create candidate for saving the prior assistant response (call without confirmed to request confirmation); a bare "save it" right after that response means this candidate, not an upload:',
        `{ entityType: "note", source: { kind: "prior-response", messageId: "${priorResponseRef.messageId}" } }`,
      ].join(" ")
    : "";
  if (lines.length === 0) return priorResponseCandidate;

  const guidance =
    'Available upload refs from this conversation. Refs are ordered newest-first. Treat this as structured candidate data; resolve any user reference to a specific upload in typed tool arguments, or ask a clarification if the candidates are insufficient. For phrases like "the uploaded image" or "the uploaded PDF" without a filename, use the newest ref matching that media type; do not ask for clarification just because older uploads exist. Describe, summarize, analyze, or discuss uploads directly from the file bytes as read-only chat responses; do not call system_create unless the user explicitly asks to save, import, preserve, or create an entity. In read-only upload summaries, answer the request directly and do not offer to save/import/create unless asked. Upload candidates are file bytes; previous assistant answers are saved separately. If the user says "save it" after your summary/answer about an upload, save the prior assistant response as a note with source.kind "prior-response" unless they explicitly ask to save the uploaded file/document itself. Use system_create source.kind upload with transform "preserve" for preserving raw file bytes as a document/image, or transform "extract-markdown" for extracting/importing upload text as a note. To keep several uploads at once, call system_create once with source.kind uploads listing every attached file. These upload transforms preserve the source wording: extract-markdown does not apply edits, summaries, translations, or restructuring. When the user asks to create a new note with such changes to an upload, use system_generate with operation.kind "prompt" instead of importing the original. Request only generation confirmation for that note; do not also call system_create to import the source as a second action. Include the readable source content and all requested changes in operation.prompt; the generation job does not receive this conversation or its attachments. An upload ref or filename alone is not source content, and is not a durable entity ref for prompt-from-source. Once a note has been created, use system_get to read its current content when asked to show it; do not substitute the original upload or reconstruct the note from chat.';

  return [
    guidance,
    priorResponseCandidate,
    formatKeepAllCandidate(attachments),
    ...lines,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function formatUploadRefLine(ref: ConversationUploadRef): string {
  return [
    `- ${ref.filename}`,
    `upload: { kind: "${ref.source.kind}", id: "${ref.source.id}" }`,
    `mediaType: ${ref.mediaType}`,
    ...(ref.savedAs
      ? [
          `saved as ${ref.savedAs.entityType} "${ref.savedAs.entityId}" holding this upload text verbatim: change it there with system_update edits quoting that text, without system_get first, never as a new ${ref.savedAs.entityType}`,
        ]
      : []),
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
