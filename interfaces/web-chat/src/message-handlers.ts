import {
  getStoredMessageAttachments as getSharedStoredMessageAttachments,
  getStoredMessageCards,
  type InterfacePluginContext,
} from "@brains/plugins";
import { stripInternalEntityMemoryNote } from "./display-content";

type PermissionResolver = (request: Request) => Promise<"anchor" | "public">;
type ConversationService = InterfacePluginContext["conversations"];

interface MessageHandlerDeps {
  conversations: ConversationService;
  resolvePermissionLevel: PermissionResolver;
  interfaceType: string;
}

export async function handleMessagesRequest(
  request: Request,
  deps: MessageHandlerDeps,
): Promise<Response> {
  const permissionLevel = await deps.resolvePermissionLevel(request);
  if (permissionLevel !== "anchor") {
    return new Response("Forbidden", { status: 403 });
  }

  const conversationId = new URL(request.url).searchParams.get("id");
  if (!conversationId) {
    return new Response("Missing conversation id", { status: 400 });
  }

  const conversation = await deps.conversations.get(conversationId);
  if (conversation?.interfaceType !== deps.interfaceType) {
    return new Response("Conversation not found", { status: 404 });
  }

  const messages = await deps.conversations.getMessages(conversationId, {
    limit: 100,
  });

  return Response.json({
    messages: messages.map((message) => {
      const attachments = getStoredMessageAttachments(
        message.metadata,
        message.timestamp,
      );
      const cards = getStoredMessageCards(message.metadata);
      return {
        id: message.id,
        role: message.role,
        content: stripInternalEntityMemoryNote(message.content),
        ...(attachments.length > 0 ? { attachments } : {}),
        ...(cards.length > 0 ? { cards } : {}),
      };
    }),
  });
}

function getStoredMessageAttachments(
  metadata: unknown,
  createdAt: string,
): Array<{
  kind: "text";
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  source?: { kind: string; id: string } | undefined;
}> {
  return getSharedStoredMessageAttachments(metadata)
    .filter((attachment) => attachment.kind === "text")
    .map((attachment) => ({
      kind: "text" as const,
      filename: attachment.filename,
      mediaType: attachment.mediaType,
      sizeBytes: attachment.sizeBytes ?? 0,
      createdAt,
      ...(attachment.source !== undefined && { source: attachment.source }),
    }));
}
