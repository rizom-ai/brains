import {
  coerceConversationMetadata,
  type InterfacePluginContext,
} from "@brains/plugins";
import { z } from "@brains/utils";

const webChatSessionLimit = 25;
const webChatTitleMessageLimit = 6;
const webChatTitleMaxLength = 48;

const renameSessionRequestSchema = z.object({
  title: z.string().trim().min(1).max(webChatTitleMaxLength),
});

type PermissionResolver = (request: Request) => Promise<"anchor" | "public">;
type ConversationService = InterfacePluginContext["conversations"];
type WebChatConversation = NonNullable<
  Awaited<ReturnType<ConversationService["get"]>>
>;

interface SessionHandlerDeps {
  conversations: ConversationService;
  resolvePermissionLevel: PermissionResolver;
  interfaceType: string;
}

export async function handleSessionsRequest(
  request: Request,
  deps: SessionHandlerDeps,
): Promise<Response> {
  const permissionLevel = await deps.resolvePermissionLevel(request);
  if (permissionLevel !== "anchor") {
    return new Response("Forbidden", { status: 403 });
  }

  const conversations = await deps.conversations.list({
    interfaceType: deps.interfaceType,
    limit: webChatSessionLimit,
  });
  const activeConversations = conversations.filter(
    (conversation) => !isArchivedMetadata(conversation.metadata),
  );
  const sessions = await Promise.all(
    activeConversations.map(async (conversation) => ({
      id: conversation.id,
      title: await getConversationTitle(conversation.id, deps.conversations),
      lastActiveAt: conversation.lastActiveAt,
    })),
  );

  return Response.json({ sessions });
}

export async function handleDeleteSessionRequest(
  request: Request,
  deps: SessionHandlerDeps,
): Promise<Response> {
  const permissionLevel = await deps.resolvePermissionLevel(request);
  if (permissionLevel !== "anchor") {
    return new Response("Forbidden", { status: 403 });
  }

  const conversation = await resolveWebChatSession(request, deps);
  if (conversation instanceof Response) return conversation;

  const deleted = await deps.conversations.delete(conversation.id);
  return Response.json({ deleted });
}

export async function handleRenameSessionRequest(
  request: Request,
  deps: SessionHandlerDeps,
): Promise<Response> {
  const permissionLevel = await deps.resolvePermissionLevel(request);
  if (permissionLevel !== "anchor") {
    return new Response("Forbidden", { status: 403 });
  }

  const conversation = await resolveWebChatSession(request, deps);
  if (conversation instanceof Response) return conversation;

  const parsed = renameSessionRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response("Invalid rename request", { status: 400 });
  }

  const renamed = await deps.conversations.updateMetadata({
    conversationId: conversation.id,
    metadata: { title: parsed.data.title },
  });

  return Response.json({ renamed, title: parsed.data.title });
}

export async function handleArchiveSessionRequest(
  request: Request,
  deps: SessionHandlerDeps,
): Promise<Response> {
  const permissionLevel = await deps.resolvePermissionLevel(request);
  if (permissionLevel !== "anchor") {
    return new Response("Forbidden", { status: 403 });
  }

  const conversation = await resolveWebChatSession(request, deps);
  if (conversation instanceof Response) return conversation;

  const archived = await deps.conversations.updateMetadata({
    conversationId: conversation.id,
    metadata: { archivedAt: new Date().toISOString() },
  });

  return Response.json({ archived });
}

async function resolveWebChatSession(
  request: Request,
  deps: SessionHandlerDeps,
): Promise<WebChatConversation | Response> {
  const conversationId = new URL(request.url).searchParams.get("id");
  if (!conversationId) {
    return new Response("Missing conversation id", { status: 400 });
  }

  const conversation = await deps.conversations.get(conversationId);
  if (conversation?.interfaceType !== deps.interfaceType) {
    return new Response("Conversation not found", { status: 404 });
  }

  return conversation;
}

async function getConversationTitle(
  conversationId: string,
  conversations: ConversationService,
): Promise<string> {
  const conversation = await conversations.get(conversationId);
  const renamedTitle = getMetadataTitle(conversation?.metadata);
  if (renamedTitle) return renamedTitle;

  const messages = await conversations.getMessages(conversationId, {
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
