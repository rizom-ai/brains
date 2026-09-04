import {
  archiveChatSessionResponseSchema,
  chatContextHandoffRequestSchema,
  chatSessionsResponseSchema,
  deleteChatSessionResponseSchema,
  renameChatSessionRequestSchema,
  renameChatSessionResponseSchema,
} from "@brains/contracts/chat";
import {
  coerceConversationMetadata,
  type InterfacePluginContext,
} from "@brains/plugins";
import {
  canAccessBrowserConversation,
  type WebChatConversation,
  type WebChatConversationAccess,
} from "./conversation-access";

const webChatSessionLimit = 25;
const webChatTitleMessageLimit = 6;
const webChatTitleMaxLength = 48;

type AccessResolver = (request: Request) => Promise<WebChatConversationAccess>;
type ConversationService = InterfacePluginContext["conversations"];

interface SessionHandlerDeps {
  conversations: ConversationService;
  resolveAccess: AccessResolver;
  interfaceType: string;
}

export async function handleSessionsRequest(
  request: Request,
  deps: SessionHandlerDeps,
): Promise<Response> {
  const access = await deps.resolveAccess(request);
  if (access.permissionLevel === "public") {
    return new Response("Forbidden", { status: 403 });
  }
  if (access.permissionLevel === "trusted" && !access.personId) {
    return new Response("Forbidden", { status: 403 });
  }

  const conversations = await deps.conversations.list({
    interfaceType: deps.interfaceType,
    limit: webChatSessionLimit,
    ...(access.permissionLevel === "trusted"
      ? { personId: access.personId }
      : {}),
  });
  const activeConversations = conversations.filter(
    (conversation) => !isArchivedMetadata(conversation.metadata),
  );
  const sessions = await Promise.all(
    activeConversations.map(async (conversation) => {
      const contextHandoff = chatContextHandoffRequestSchema.safeParse(
        coerceConversationMetadata(conversation.metadata)["contextHandoff"],
      );
      return {
        id: conversation.id,
        title: await getConversationTitle(conversation, deps.conversations),
        lastActiveAt: conversation.lastActiveAt,
        ...(contextHandoff.success
          ? { contextHandoff: contextHandoff.data }
          : {}),
      };
    }),
  );

  return Response.json(chatSessionsResponseSchema.parse({ sessions }));
}

export async function handleDeleteSessionRequest(
  request: Request,
  deps: SessionHandlerDeps,
): Promise<Response> {
  const access = await deps.resolveAccess(request);
  if (access.permissionLevel === "public") {
    return new Response("Forbidden", { status: 403 });
  }

  const conversation = await resolveWebChatSession(request, deps, access);
  if (conversation instanceof Response) return conversation;

  const deleted = await deps.conversations.delete(conversation.id);
  return Response.json(deleteChatSessionResponseSchema.parse({ deleted }));
}

export async function handleRenameSessionRequest(
  request: Request,
  deps: SessionHandlerDeps,
): Promise<Response> {
  const access = await deps.resolveAccess(request);
  if (access.permissionLevel === "public") {
    return new Response("Forbidden", { status: 403 });
  }

  const conversation = await resolveWebChatSession(request, deps, access);
  if (conversation instanceof Response) return conversation;

  const parsed = renameChatSessionRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response("Invalid rename request", { status: 400 });
  }

  const renamed = await deps.conversations.updateMetadata({
    conversationId: conversation.id,
    metadata: { title: parsed.data.title },
  });

  return Response.json(
    renameChatSessionResponseSchema.parse({
      renamed,
      title: parsed.data.title,
    }),
  );
}

export async function handleArchiveSessionRequest(
  request: Request,
  deps: SessionHandlerDeps,
): Promise<Response> {
  const access = await deps.resolveAccess(request);
  if (access.permissionLevel === "public") {
    return new Response("Forbidden", { status: 403 });
  }

  const conversation = await resolveWebChatSession(request, deps, access);
  if (conversation instanceof Response) return conversation;

  const archived = await deps.conversations.updateMetadata({
    conversationId: conversation.id,
    metadata: { archivedAt: new Date().toISOString() },
  });

  return Response.json(archiveChatSessionResponseSchema.parse({ archived }));
}

/**
 * Resolve the `?id` conversation for a request, enforcing browser-conversation
 * access. Shared by the session and message handlers so the 400/404 semantics
 * cannot drift between them.
 */
export async function resolveWebChatSession(
  request: Request,
  deps: Pick<SessionHandlerDeps, "conversations" | "interfaceType">,
  access: WebChatConversationAccess,
): Promise<WebChatConversation | Response> {
  const conversationId = new URL(request.url).searchParams.get("id");
  if (!conversationId) {
    return new Response("Missing conversation id", { status: 400 });
  }

  const conversation = await deps.conversations.get(conversationId);
  if (!canAccessBrowserConversation(conversation, access, deps.interfaceType)) {
    return new Response("Conversation not found", { status: 404 });
  }

  return conversation;
}

async function getConversationTitle(
  conversation: WebChatConversation,
  conversations: ConversationService,
): Promise<string> {
  const renamedTitle = getMetadataTitle(conversation.metadata);
  if (renamedTitle) return renamedTitle;

  const messages = await conversations.getMessages(conversation.id, {
    limit: webChatTitleMessageLimit,
  });
  const firstUserMessage = messages.find(
    (message) => message.role === "user" && message.content.trim().length > 0,
  );
  if (!firstUserMessage) return "New conversation";

  const firstLine = firstUserMessage.content.trim().split(/\r?\n/, 1)[0] ?? "";
  if (firstLine.length <= webChatTitleMaxLength) return firstLine;
  return `${firstLine.slice(0, webChatTitleMaxLength - 1).trimEnd()}…`;
}

function isArchivedMetadata(metadata: unknown): boolean {
  return typeof coerceConversationMetadata(metadata)["archivedAt"] === "string";
}

function getMetadataTitle(metadata: unknown): string | undefined {
  const title = coerceConversationMetadata(metadata)["title"];
  return typeof title === "string" && title.trim().length > 0
    ? title
    : undefined;
}
