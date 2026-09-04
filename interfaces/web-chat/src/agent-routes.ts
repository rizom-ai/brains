import {
  AGENT_ACTION_REQUEST_CHANNEL,
  createExternalActorId,
  parseAgentResponse,
} from "@brains/contracts";
import { chatActionRequestSchema } from "@brains/contracts/chat";
import type {
  AgentNamespace,
  AuthPrincipal,
  ChatContext,
  UserPermissionLevel,
} from "@brains/sdk/interfaces";
import { z } from "@brains/utils/zod";
import type { BrowserAccessReader } from "./browser-access";

/**
 * The two ways in that are not the browser's own stream.
 *
 * A remote agent talks to this brain over plain JSON rather than the event
 * stream the page uses, and the console posts an action a card offered. Both
 * gate on the same browser session as everything else, and both put their
 * question to the agent or the bus directly.
 */

const remoteAgentInterfaceType = "remote-agent";

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

export interface AgentRouteDeps {
  access: BrowserAccessReader;
  agent: AgentNamespace;
  messaging: {
    send(message: { type: string; payload: unknown }): Promise<unknown>;
  };
  interfaceType: string;
}

async function readJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
}

/**
 * Who the agent is answering, when the caller is a remote agent rather than
 * a signed-in person. Without a principal the actor is external and named
 * after the conversation, so the turn is still attributable to something.
 */
function remoteAgentChatContext(
  conversationId: string,
  permissionLevel: UserPermissionLevel,
  principal: AuthPrincipal | undefined,
): ChatContext {
  return {
    userPermissionLevel: permissionLevel,
    isAnchor: principal?.isAnchor ?? false,
    interfaceType: remoteAgentInterfaceType,
    channelId: conversationId,
    channelName: "Remote Agent",
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

export async function handleRemoteAgentChatRequest(
  request: Request,
  deps: AgentRouteDeps,
): Promise<Response> {
  const { principal, permissionLevel, hasChatAccess } =
    await deps.access.resolve(request);
  if (!hasChatAccess) return new Response("Forbidden", { status: 403 });

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const parsed = remoteAgentChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response("Invalid remote agent chat request", { status: 400 });
  }

  const accessError = await deps.access.ensure(
    parsed.data.conversationId,
    remoteAgentInterfaceType,
    "Remote Agent",
    deps.access.toConversationAccess(permissionLevel, principal),
  );
  if (accessError) return accessError;

  return Response.json(
    await deps.agent.chat(
      parsed.data.message,
      parsed.data.conversationId,
      remoteAgentChatContext(
        parsed.data.conversationId,
        permissionLevel,
        principal,
      ),
      request.signal,
    ),
  );
}

export async function handleRemoteAgentConfirmRequest(
  request: Request,
  deps: AgentRouteDeps,
): Promise<Response> {
  const { principal, permissionLevel, hasChatAccess } =
    await deps.access.resolve(request);
  if (!hasChatAccess) return new Response("Forbidden", { status: 403 });

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const parsed = remoteAgentConfirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response("Invalid remote agent confirm request", {
      status: 400,
    });
  }

  // Confirming resolves something already pending, so the conversation must
  // exist: starting one here would be answering a question nobody asked.
  const accessError = await deps.access.requireExisting(
    parsed.data.conversationId,
    remoteAgentInterfaceType,
    deps.access.toConversationAccess(permissionLevel, principal),
  );
  if (accessError) return accessError;

  return Response.json(
    await deps.agent.confirmPendingAction(
      parsed.data.conversationId,
      parsed.data.confirmed,
      parsed.data.approvalId,
      remoteAgentChatContext(
        parsed.data.conversationId,
        permissionLevel,
        principal,
      ),
      request.signal,
    ),
  );
}

export async function handleActionRequest(
  request: Request,
  deps: AgentRouteDeps,
): Promise<Response> {
  const { principal, permissionLevel, hasChatAccess } =
    await deps.access.resolve(request);
  if (!hasChatAccess) return new Response("Forbidden", { status: 403 });

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const parsed = chatActionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response("Invalid chat action request", { status: 400 });
  }

  const accessError = await deps.access.requireExisting(
    parsed.data.conversationId,
    deps.interfaceType,
    deps.access.toConversationAccess(permissionLevel, principal),
  );
  if (accessError) return accessError;

  const response = await deps.messaging.send({
    type: AGENT_ACTION_REQUEST_CHANNEL,
    payload: {
      conversationId: parsed.data.conversationId,
      interfaceType: deps.interfaceType,
      channelName: "Web Chat",
      userPermissionLevel: permissionLevel,
      isAnchor: principal?.isAnchor ?? false,
      action: parsed.data.action,
    },
  });

  if (
    typeof response !== "object" ||
    response === null ||
    "noop" in response ||
    !("success" in response) ||
    response.success !== true ||
    !("data" in response)
  ) {
    return new Response("No runtime action handler", { status: 404 });
  }

  try {
    return Response.json(parseAgentResponse(response.data));
  } catch {
    return new Response("Invalid runtime action response", { status: 502 });
  }
}
