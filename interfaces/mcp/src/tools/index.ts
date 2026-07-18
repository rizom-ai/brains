import { createHash, randomUUID } from "node:crypto";
import { actorRefKey } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { ToolResponse } from "@brains/mcp-service";
import type {
  Tool,
  InterfacePluginContext,
  ChatContext,
} from "@brains/plugins";
import { agentResponseToToolResponse } from "./agent-response-adapter";

const chatInputSchema = z.object({
  message: z.string().min(1),
  conversationId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Opaque conversation handle returned by a previous chat call. Omit it to start a new isolated conversation.",
    ),
});

const confirmInputSchema = z.object({
  approvalId: z.string().min(1),
  confirmed: z.boolean(),
  conversationId: z
    .string()
    .min(1)
    .describe("Exact conversation handle returned by the chat confirmation."),
});

interface MCPConversationRef {
  /** Opaque handle returned to the MCP caller and reused on follow-ups. */
  handle: string;
  /** Subject-scoped id used by the brain conversation service. */
  internalId: string;
}

function getConversationRef(
  input: { conversationId?: string },
  actorKey: string,
  contextConversationId?: string,
  channelId?: string,
): MCPConversationRef {
  const handle =
    input.conversationId ??
    contextConversationId ??
    channelId ??
    `conversation-${randomUUID()}`;
  const subjectScope = createHash("sha256")
    .update(actorKey)
    .digest("hex")
    .slice(0, 16);
  return {
    handle,
    internalId: `mcp:${subjectScope}:${handle}`,
  };
}

function getChatContext(
  toolContext: Parameters<Tool["handler"]>[1],
): ChatContext {
  return {
    userPermissionLevel: toolContext.userPermissionLevel ?? "public",
    interfaceType: "mcp",
    ...(toolContext.channelId ? { channelId: toolContext.channelId } : {}),
    ...(toolContext.channelName
      ? { channelName: toolContext.channelName }
      : {}),
    actor: {
      identity: toolContext.actor,
      interfaceType: "mcp",
      role: "user",
      ...(toolContext.displayName
        ? { displayName: toolContext.displayName }
        : {}),
    },
  };
}

/**
 * Create MCP interface tools.
 *
 * Query tools are provided by the system plugin. The MCP interface owns the
 * command-side chat adapter that routes mutations/reasoned requests through the
 * brain agent instead of exposing raw write tools to external clients.
 */
export function createMCPTools(
  _pluginId: string,
  getContext: () => InterfacePluginContext | undefined,
): Tool[] {
  return [
    {
      name: "chat",
      description:
        "Talk to the brain to make changes or get reasoned answers. Use this for any create/update/delete request or questions requiring reasoning across content. For simple lookups, use search/get/list directly.",
      inputSchema: chatInputSchema.shape,
      visibility: "public",
      sideEffects: "writes",
      handler: async (rawInput, toolContext): Promise<ToolResponse> => {
        const input = chatInputSchema.parse(rawInput);
        const context = getContext();
        if (!context) {
          return {
            success: false,
            error: "MCP chat tool is not initialized.",
          };
        }

        const conversation = getConversationRef(
          input,
          actorRefKey(toolContext.actor),
          toolContext.conversationId,
          toolContext.channelId,
        );
        const chatContext = getChatContext(toolContext);
        const response = toolContext.signal
          ? await context.agent.chat(
              input.message,
              conversation.internalId,
              chatContext,
              toolContext.signal,
            )
          : await context.agent.chat(
              input.message,
              conversation.internalId,
              chatContext,
            );

        return agentResponseToToolResponse(response, {
          conversationId: conversation.handle,
        });
      },
    },
    {
      name: "confirm",
      description:
        "Resolve a pending confirmation returned by chat. Use this only after chat returns needsConfirmation with an approvalId.",
      inputSchema: confirmInputSchema.shape,
      visibility: "public",
      sideEffects: "writes",
      handler: async (rawInput, toolContext): Promise<ToolResponse> => {
        const input = confirmInputSchema.parse(rawInput);
        const context = getContext();
        if (!context) {
          return {
            success: false,
            error: "MCP confirm tool is not initialized.",
          };
        }

        const conversation = getConversationRef(
          input,
          actorRefKey(toolContext.actor),
          toolContext.conversationId,
          toolContext.channelId,
        );
        const chatContext = getChatContext(toolContext);
        const response = toolContext.signal
          ? await context.agent.confirmPendingAction(
              conversation.internalId,
              input.confirmed,
              input.approvalId,
              chatContext,
              toolContext.signal,
            )
          : await context.agent.confirmPendingAction(
              conversation.internalId,
              input.confirmed,
              input.approvalId,
              chatContext,
            );

        return agentResponseToToolResponse(response, {
          conversationId: conversation.handle,
        });
      },
    },
  ];
}
