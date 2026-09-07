import { createExternalActorId } from "@brains/contracts";
import type { AuthPrincipal } from "@brains/auth-service";
import type {
  ChatContext,
  MessageInterfacePluginContext,
  UserPermissionLevel,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { WebChatConversationAccess } from "./conversation-access";

export const remoteAgentInterfaceType = "remote-agent";
const remoteAgentChannelName = "Remote Agent";

const remoteAgentChatRequestSchema = z
  .object({
    message: z.string().min(1),
    conversationId: z.string().min(1),
  })
  .strict();

const remoteAgentConfirmRequestSchema = z
  .object({
    conversationId: z.string().min(1),
    confirmed: z.boolean(),
    approvalId: z.string().min(1),
  })
  .strict();

export interface RemoteAgentAccess {
  principal?: AuthPrincipal | undefined;
  permissionLevel: UserPermissionLevel;
  hasChatAccess: boolean;
}

export interface RemoteAgentHandlerDeps {
  agent: Pick<
    MessageInterfacePluginContext["agent"],
    "chat" | "confirmPendingAction"
  >;
  resolveBrowserAccess: (request: Request) => Promise<RemoteAgentAccess>;
  toConversationAccess: (
    permissionLevel: UserPermissionLevel,
    principal: AuthPrincipal | undefined,
  ) => WebChatConversationAccess;
  /** Create the remote-agent conversation when it does not exist yet. */
  ensureConversation: (
    conversationId: string,
    interfaceType: string,
    channelName: string,
    access: WebChatConversationAccess,
  ) => Promise<Response | undefined>;
  /** Refuse when the remote-agent conversation does not exist. */
  requireExistingConversation: (
    conversationId: string,
    interfaceType: string,
    access: WebChatConversationAccess,
  ) => Promise<Response | undefined>;
}

export function createRemoteAgentChatContext(
  conversationId: string,
  permissionLevel: UserPermissionLevel,
  principal: AuthPrincipal | undefined,
): ChatContext {
  return {
    userPermissionLevel: permissionLevel,
    isAnchor: principal?.isAnchor ?? false,
    interfaceType: remoteAgentInterfaceType,
    channelId: conversationId,
    channelName: remoteAgentChannelName,
    actor: {
      identity: principal
        ? {
            kind: "user",
            userId: principal.userId,
            ...(principal.canonicalId
              ? { canonicalId: principal.canonicalId }
              : {}),
          }
        : {
            kind: "external",
            externalActorId: createExternalActorId(
              remoteAgentInterfaceType,
              `${remoteAgentInterfaceType}:${conversationId}:browser-user`,
            ),
          },
      interfaceType: remoteAgentInterfaceType,
      role: "user",
      displayName: principal?.displayName ?? "Remote agent user",
    },
  };
}

async function readJsonBody(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
}

export async function handleRemoteAgentChatRequest(
  request: Request,
  deps: RemoteAgentHandlerDeps,
): Promise<Response> {
  const { principal, permissionLevel, hasChatAccess } =
    await deps.resolveBrowserAccess(request);
  if (!hasChatAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const parsed = remoteAgentChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response("Invalid remote agent chat request", { status: 400 });
  }
  const accessError = await deps.ensureConversation(
    parsed.data.conversationId,
    remoteAgentInterfaceType,
    remoteAgentChannelName,
    deps.toConversationAccess(permissionLevel, principal),
  );
  if (accessError) return accessError;

  const response = await deps.agent.chat(
    parsed.data.message,
    parsed.data.conversationId,
    createRemoteAgentChatContext(
      parsed.data.conversationId,
      permissionLevel,
      principal,
    ),
    request.signal,
  );

  return Response.json(response);
}

export async function handleRemoteAgentConfirmRequest(
  request: Request,
  deps: RemoteAgentHandlerDeps,
): Promise<Response> {
  const { principal, permissionLevel, hasChatAccess } =
    await deps.resolveBrowserAccess(request);
  if (!hasChatAccess) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = await readJsonBody(request);
  if (body instanceof Response) return body;
  const parsed = remoteAgentConfirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response("Invalid remote agent confirm request", {
      status: 400,
    });
  }
  const accessError = await deps.requireExistingConversation(
    parsed.data.conversationId,
    remoteAgentInterfaceType,
    deps.toConversationAccess(permissionLevel, principal),
  );
  if (accessError) return accessError;

  const response = await deps.agent.confirmPendingAction(
    parsed.data.conversationId,
    parsed.data.confirmed,
    parsed.data.approvalId,
    createRemoteAgentChatContext(
      parsed.data.conversationId,
      permissionLevel,
      principal,
    ),
    request.signal,
  );

  return Response.json(response);
}
