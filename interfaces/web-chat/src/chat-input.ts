import {
  chatApprovalResponsePartSchema,
  chatFilePartSchema,
  chatMessageRequestSchema,
  chatTextPartSchema,
  chatUploadPartSchema,
  type ChatApprovalResponse,
  type ChatMessageRequest,
} from "@brains/contracts/chat";
import {
  type ChatAttachment,
  type ScopedRuntimeUploadStore,
} from "@brains/sdk/interfaces";
import {
  resolveInlineUploadPart as resolveInlineUploadFilePart,
  resolveReferencedUpload as resolveReferencedUploadPart,
} from "./upload-handlers";

export type ApprovalResponse = ChatApprovalResponse;
export type ChatRequest = ChatMessageRequest;

export const chatRequestSchema: typeof chatMessageRequestSchema =
  chatMessageRequestSchema;

export interface ParsedUserInput {
  message: string;
  attachments: ChatAttachment[];
  messageId?: string;
  responseText?: string;
}

interface ChatInputDeps {
  uploadStore: ScopedRuntimeUploadStore;
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
    const parsedText = chatTextPartSchema.safeParse(part);
    if (parsedText.success) {
      if (parsedText.data.text.length > 0) {
        messageParts.push(parsedText.data.text);
      }
      continue;
    }

    const parsedFile = chatFilePartSchema.safeParse(part);
    if (parsedFile.success) {
      const attachment = resolveInlineUploadFilePart(parsedFile.data);
      if (attachment instanceof Response) return attachment;
      attachments.push(attachment);
      continue;
    }

    const parsedUploadRef = chatUploadPartSchema.safeParse(part);
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
    .map((part) => chatApprovalResponsePartSchema.safeParse(part))
    .filter((result) => result.success)
    .map((result) => ({
      ...result.data.approval,
      ...(result.data.toolCallId ? { toolCallId: result.data.toolCallId } : {}),
      ...(result.data.toolName ? { toolName: result.data.toolName } : {}),
      ...(result.data.input ? { input: result.data.input } : {}),
      ...(result.data.title ? { title: result.data.title } : {}),
    }));
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
