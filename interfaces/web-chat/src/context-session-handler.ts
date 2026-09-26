import { createHash } from "node:crypto";
import {
  chatContextHandoffRequestSchema,
  chatContextHandoffResponseSchema,
  type ChatContextHandoffRequest,
} from "@brains/contracts/chat";
import {
  canAccessBrowserConversation,
  type WebChatConversationAccess,
} from "./conversation-access";
import { coerceConversationMetadata } from "@brains/sdk/interfaces";
import type {
  IInterfaceConversationsNamespace,
  UserPermissionLevel,
} from "@brains/sdk/interfaces";

type ConversationService = IInterfaceConversationsNamespace;

interface ContextSessionHandlerDeps {
  conversations: ConversationService;
  interfaceType: string;
  resolveAccess(request: Request): Promise<WebChatConversationAccess>;
  authorizeSource(input: {
    sourceId: string;
    itemId: string;
    permissionLevel: UserPermissionLevel;
    signal: AbortSignal;
  }): Promise<boolean>;
}

/**
 * Find or create the actor's durable conversation for one bounded source
 * locator. Resolved source detail is authorization evidence only and is never
 * persisted in conversation metadata.
 */
export async function handleContextSessionRequest(
  request: Request,
  deps: ContextSessionHandlerDeps,
): Promise<Response> {
  const access = await deps.resolveAccess(request);
  if (access.permissionLevel === "public" || !access.personId) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid context session request", { status: 400 });
  }
  const parsed = chatContextHandoffRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response("Invalid context session request", { status: 400 });
  }

  const authorized = await deps
    .authorizeSource({
      sourceId: parsed.data.sourceId,
      itemId: parsed.data.itemId,
      permissionLevel: access.permissionLevel,
      signal: request.signal,
    })
    .catch(() => false);
  if (!authorized) {
    return new Response("Source context is unavailable", { status: 409 });
  }

  const existing = (
    await deps.conversations.list({
      interfaceType: deps.interfaceType,
      personId: access.personId,
      limit: 100,
    })
  ).find((conversation) =>
    hasContextHandoff(conversation.metadata, parsed.data),
  );
  if (existing) {
    if (!canAccessBrowserConversation(existing, access, deps.interfaceType)) {
      return new Response("Conversation not found", { status: 404 });
    }
    await restoreContextConversation(
      deps.conversations,
      existing.id,
      parsed.data,
    );
    return contextSessionResponse(existing.id);
  }

  const conversationId = contextConversationId(access.personId, parsed.data);
  const occupied = await deps.conversations.get(conversationId);
  if (occupied) {
    if (
      !canAccessBrowserConversation(occupied, access, deps.interfaceType) ||
      !hasContextHandoff(occupied.metadata, parsed.data)
    ) {
      return new Response("Conversation not found", { status: 404 });
    }
    await restoreContextConversation(
      deps.conversations,
      occupied.id,
      parsed.data,
    );
    return contextSessionResponse(occupied.id);
  }

  await deps.conversations.start({
    sessionId: conversationId,
    interfaceType: deps.interfaceType,
    channelId: conversationId,
    personId: access.personId,
    metadata: {
      channelName: "Web Chat",
      interfaceType: deps.interfaceType,
      channelId: conversationId,
    },
  });
  const created = await deps.conversations.get(conversationId);
  if (!canAccessBrowserConversation(created, access, deps.interfaceType)) {
    return new Response("Conversation not found", { status: 404 });
  }
  await restoreContextConversation(
    deps.conversations,
    conversationId,
    parsed.data,
  );
  return contextSessionResponse(conversationId);
}

function contextConversationId(
  personId: string,
  handoff: ChatContextHandoffRequest,
): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        handoff.version,
        personId,
        handoff.sourceId,
        handoff.itemId,
      ]),
    )
    .digest("hex")
    .slice(0, 32);
  return `web-context-${digest}`;
}

function hasContextHandoff(
  metadata: unknown,
  handoff: ChatContextHandoffRequest,
): boolean {
  const stored = chatContextHandoffRequestSchema.safeParse(
    coerceConversationMetadata(metadata)["contextHandoff"],
  );
  return (
    stored.success &&
    stored.data.sourceId === handoff.sourceId &&
    stored.data.itemId === handoff.itemId
  );
}

async function restoreContextConversation(
  conversations: ConversationService,
  conversationId: string,
  handoff: ChatContextHandoffRequest,
): Promise<void> {
  await conversations.updateMetadata({
    conversationId,
    metadata: {
      title: handoff.titleSeed,
      contextHandoff: handoff,
      archivedAt: null,
    },
  });
}

function contextSessionResponse(conversationId: string): Response {
  return Response.json(
    chatContextHandoffResponseSchema.parse({ conversationId }),
  );
}
