import {
  AGENT_ACTION_REQUEST_CHANNEL,
  parseAgentResponse,
} from "@brains/contracts";
import { chatActionRequestSchema } from "@brains/contracts/chat";
import type { AgentNamespace } from "@brains/sdk/interfaces";
import type { BrowserAccessReader } from "./browser-access";

/** Console card actions use the same browser access gate as chat, then
 * dispatch through the runtime bus. Remote-agent JSON routes are separate.
 */

export interface AgentRouteDeps {
  access: BrowserAccessReader;
  agent: AgentNamespace;
  messaging: {
    request(message: { type: string; payload: unknown }): Promise<unknown>;
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

  const response = await deps.messaging.request({
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
