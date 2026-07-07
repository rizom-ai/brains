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
  conversationId: z.string().min(1).optional(),
});

const confirmInputSchema = z.object({
  approvalId: z.string().min(1),
  confirmed: z.boolean(),
  conversationId: z.string().min(1).optional(),
});

function getConversationId(
  input: { conversationId?: string },
  userId: string,
  contextConversationId?: string,
  channelId?: string,
): string {
  return (
    input.conversationId ??
    contextConversationId ??
    channelId ??
    `mcp:${userId}`
  );
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
      actorId: toolContext.userId,
      interfaceType: "mcp",
      role: "user",
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

        const conversationId = getConversationId(
          input,
          toolContext.userId,
          toolContext.conversationId,
          toolContext.channelId,
        );
        const response = await context.agent.chat(
          input.message,
          conversationId,
          {
            ...getChatContext(toolContext),
          },
        );

        return agentResponseToToolResponse(response, { conversationId });
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

        const conversationId = getConversationId(
          input,
          toolContext.userId,
          toolContext.conversationId,
          toolContext.channelId,
        );
        const response = await context.agent.confirmPendingAction(
          conversationId,
          input.confirmed,
          input.approvalId,
          getChatContext(toolContext),
        );

        return agentResponseToToolResponse(response, { conversationId });
      },
    },
  ];
}
