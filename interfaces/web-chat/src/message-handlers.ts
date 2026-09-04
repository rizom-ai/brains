import { chatMessagesResponseSchema } from "@brains/contracts/chat";
import {
  getStoredMessageAttachments as getSharedStoredMessageAttachments,
  getStoredMessageCards,
} from "@brains/sdk/interfaces";
import type { IInterfaceConversationsNamespace } from "@brains/sdk/interfaces";
import { stripInternalEntityMemoryNote } from "./display-content";
import type { WebChatConversationAccess } from "./conversation-access";
import { resolveWebChatSession } from "./session-handlers";

type AccessResolver = (request: Request) => Promise<WebChatConversationAccess>;
type ConversationService = IInterfaceConversationsNamespace;

interface MessageHandlerDeps {
  conversations: ConversationService;
  resolveAccess: AccessResolver;
  interfaceType: string;
}

export async function handleMessagesRequest(
  request: Request,
  deps: MessageHandlerDeps,
): Promise<Response> {
  const access = await deps.resolveAccess(request);
  if (access.permissionLevel === "public") {
    return new Response("Forbidden", { status: 403 });
  }

  const conversation = await resolveWebChatSession(request, deps, access);
  if (conversation instanceof Response) return conversation;

  const messages = await deps.conversations.getMessages(conversation.id, {
    limit: 100,
  });

  return Response.json(
    chatMessagesResponseSchema.parse({
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
    }),
  );
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
