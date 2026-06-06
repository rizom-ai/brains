import {
  type ChatAttachment,
  type IConversationsNamespace,
  type RuntimeUploadStore,
} from "@brains/plugins";
import { z } from "@brains/utils";
import { parseStoredMessageMetadata } from "./message-handlers";
import { webChatUploadIdPattern, webChatUploadRefKind } from "./upload-store";
import {
  resolveInlineUploadPart as resolveInlineUploadFilePart,
  resolveReferencedUpload as resolveReferencedUploadPart,
} from "./upload-handlers";

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const filePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
  url: z.string(),
});

const approvalResponsePartSchema = z
  .object({
    state: z.literal("approval-responded"),
    approval: z.object({
      id: z.string(),
      approved: z.boolean(),
    }),
  })
  .passthrough();

const uiMessageSchema = z.object({
  role: z.string(),
  parts: z.array(z.unknown()).optional(),
  content: z.string().optional(),
});

export const chatRequestSchema = z.object({
  id: z.string().optional(),
  messages: z.array(uiMessageSchema).min(1),
  trigger: z.string().optional(),
});

const uploadRefSchema = z.object({
  kind: z.literal(webChatUploadRefKind),
  id: z.string().regex(webChatUploadIdPattern),
});

const uploadRefPartSchema = z.object({
  type: z.literal("data-upload"),
  data: z.object({
    ref: uploadRefSchema,
  }),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ApprovalResponse = z.infer<
  typeof approvalResponsePartSchema
>["approval"];

export interface ParsedUserInput {
  message: string;
  attachments: ChatAttachment[];
  responseText?: string;
}

interface ChatInputDeps {
  conversations: IConversationsNamespace;
  uploadStore: RuntimeUploadStore;
}

export async function extractLastUserInput(
  request: ChatRequest,
  conversationId: string,
  deps: ChatInputDeps,
): Promise<ParsedUserInput | Response> {
  const lastUserMessage = findLastUserMessage(request);
  if (!lastUserMessage) return { message: "", attachments: [] };

  const messageParts: string[] = [];
  const attachments: ChatAttachment[] = [];
  for (const part of lastUserMessage.parts ?? []) {
    const parsedText = textPartSchema.safeParse(part);
    if (parsedText.success) {
      if (parsedText.data.text.length > 0) {
        messageParts.push(parsedText.data.text);
      }
      continue;
    }

    const parsedFile = filePartSchema.safeParse(part);
    if (parsedFile.success) {
      const attachment = resolveInlineUploadFilePart(parsedFile.data);
      if (attachment instanceof Response) return attachment;
      attachments.push(attachment);
      continue;
    }

    const parsedUploadRef = uploadRefPartSchema.safeParse(part);
    if (parsedUploadRef.success) {
      const attachment = await resolveReferencedUploadPart(
        parsedUploadRef.data.data.ref.id,
        deps.uploadStore,
      );
      if (attachment instanceof Response) return attachment;
      attachments.push(attachment);
      continue;
    }

    if (getPartType(part) === "data-upload") {
      return new Response("Invalid upload ref", { status: 400 });
    }
  }

  const message =
    messageParts.length > 0
      ? messageParts.join("\n\n")
      : (lastUserMessage.content ?? "");

  if (attachments.length === 0) {
    const deferred = await resolveDeferredUploadReference(
      request,
      conversationId,
      lastUserMessage,
      message,
      deps,
    );
    if (deferred instanceof Response) return deferred;
    if (deferred !== null) {
      return {
        message: deferred.message ?? message,
        attachments: deferred.attachments,
        ...(deferred.responseText !== undefined
          ? { responseText: deferred.responseText }
          : {}),
      };
    }
  }

  return {
    message,
    attachments,
  };
}

export function extractLatestApprovalResponses(
  request: ChatRequest,
): ApprovalResponse[] {
  // Clients resend the full message history on every turn, but only the
  // trailing assistant message carries this turn's approval responses.
  // Scanning earlier messages would replay decisions the agent already
  // executed.
  const lastMessage = request.messages.at(-1);
  if (!lastMessage || lastMessage.role === "user") return [];

  return (lastMessage.parts ?? [])
    .map((part) => approvalResponsePartSchema.safeParse(part))
    .filter((result) => result.success)
    .map((result) => result.data.approval);
}

async function resolveDeferredUploadReference(
  request: ChatRequest,
  conversationId: string,
  lastUserMessage: ChatRequest["messages"][number],
  message: string,
  deps: ChatInputDeps,
): Promise<
  | (Pick<ParsedUserInput, "attachments"> &
      Partial<Pick<ParsedUserInput, "message" | "responseText">>)
  | null
> {
  const uploadIds = await collectPriorUploadIds(
    request,
    conversationId,
    lastUserMessage,
    deps.conversations,
  );
  const attachments: ChatAttachment[] = [];
  for (const uploadId of uploadIds) {
    const attachment = await resolveReferencedUploadPart(
      uploadId,
      deps.uploadStore,
    );
    if (attachment instanceof Response) continue;
    attachments.push(attachment);
  }

  if (attachments.length === 0) return null;

  return {
    message,
    attachments: selectPriorUploads(message, attachments),
  };
}

function selectPriorUploads(
  message: string,
  attachments: ChatAttachment[],
): ChatAttachment[] {
  const normalized = message.toLowerCase();
  const named = attachments.filter((attachment) =>
    normalized.includes(attachment.filename.toLowerCase()),
  );
  if (named.length > 0) return named;
  if (/\b(first|oldest|earliest)\b/.test(normalized)) {
    return attachments.slice(0, 1);
  }
  if (/\b(latest|newest|most recent|last)\b/.test(normalized)) {
    return attachments.slice(-1);
  }
  return attachments;
}

async function collectPriorUploadIds(
  request: ChatRequest,
  conversationId: string,
  lastUserMessage: ChatRequest["messages"][number],
  conversations: IConversationsNamespace,
): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (uploadId: string): void => {
    if (seen.has(uploadId)) return;
    seen.add(uploadId);
    ids.push(uploadId);
  };

  const lastUserIndex = request.messages.indexOf(lastUserMessage);
  const priorMessages = request.messages.slice(
    0,
    lastUserIndex === -1 ? request.messages.length : lastUserIndex,
  );
  for (const message of priorMessages) {
    if (message.role !== "user") continue;
    for (const part of message.parts ?? []) {
      const parsedUploadRef = uploadRefPartSchema.safeParse(part);
      if (parsedUploadRef.success) {
        add(parsedUploadRef.data.data.ref.id);
      }
    }
  }

  const storedMessages = await conversations.getMessages(conversationId, {
    limit: 50,
  });
  for (const message of storedMessages) {
    if (message.role !== "user") continue;
    const parsedMetadata = parseStoredMessageMetadata(message.metadata);
    const attachments = parsedMetadata?.["attachments"];
    if (!Array.isArray(attachments)) continue;
    for (const attachment of attachments) {
      if (!isRecord(attachment)) continue;
      const source = attachment["source"];
      if (!isRecord(source)) continue;
      if (source["kind"] !== webChatUploadRefKind) continue;
      const uploadId = source["id"];
      if (
        typeof uploadId === "string" &&
        webChatUploadIdPattern.test(uploadId)
      ) {
        add(uploadId);
      }
    }
  }

  return ids;
}

function findLastUserMessage(
  request: ChatRequest,
): ChatRequest["messages"][number] | undefined {
  for (let index = request.messages.length - 1; index >= 0; index -= 1) {
    const message = request.messages[index];
    if (message?.role === "user") return message;
  }
  return undefined;
}

function getPartType(part: unknown): string | undefined {
  if (typeof part !== "object" || part === null || !("type" in part)) {
    return undefined;
  }
  const type = part.type;
  return typeof type === "string" ? type : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
