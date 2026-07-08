import { type ChatAttachment, type RuntimeUploadStore } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { webChatUploadIdPattern, webChatUploadRefKind } from "./upload-store";
import {
  resolveInlineUploadPart as resolveInlineUploadFilePart,
  resolveReferencedUpload as resolveReferencedUploadPart,
} from "./upload-handlers";

interface TextPart {
  type: "text";
  text: string;
}

interface FilePart {
  type: "file";
  mediaType?: string | undefined;
  filename?: string | undefined;
  url: string;
}

export interface ApprovalResponse {
  id: string;
  approved: boolean;
}

interface ApprovalResponsePart {
  [key: string]: unknown;
  state: "approval-responded";
  approval: ApprovalResponse;
}

interface UiMessage {
  id?: string | undefined;
  role: string;
  parts?: unknown[] | undefined;
  content?: string | undefined;
}

export interface ChatRequest {
  id?: string | undefined;
  messages: UiMessage[];
  trigger?: string | undefined;
}

const textPartSchema: z.ZodType<TextPart> = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const filePartSchema: z.ZodType<FilePart> = z.object({
  type: z.literal("file"),
  mediaType: z.string().optional(),
  filename: z.string().optional(),
  url: z.string(),
});

const approvalResponsePartSchema: z.ZodType<ApprovalResponsePart> =
  z.looseObject({
    state: z.literal("approval-responded"),
    approval: z.object({
      id: z.string(),
      approved: z.boolean(),
    }),
  });

const uiMessageSchema: z.ZodType<UiMessage> = z.object({
  id: z.string().optional(),
  role: z.string(),
  parts: z.array(z.unknown()).optional(),
  content: z.string().optional(),
});

export const chatRequestSchema: z.ZodType<ChatRequest> = z.object({
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

export interface ParsedUserInput {
  message: string;
  attachments: ChatAttachment[];
  messageId?: string;
  responseText?: string;
}

interface ChatInputDeps {
  uploadStore: RuntimeUploadStore;
}

export async function extractLastUserInput(
  request: ChatRequest,
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

  return {
    message,
    attachments,
    ...(lastUserMessage.id ? { messageId: lastUserMessage.id } : {}),
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
