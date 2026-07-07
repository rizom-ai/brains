import { z } from "@brains/utils/zod";
import type { ToolResponse } from "@brains/mcp-service";
import type { Tool, InterfacePluginContext } from "@brains/plugins";
import { agentResponseToToolResponse } from "./agent-response-adapter";

const chatInputSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().min(1).optional(),
});

function getConversationId(
  input: z.infer<typeof chatInputSchema>,
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
            userPermissionLevel: toolContext.userPermissionLevel ?? "public",
            interfaceType: "mcp",
            ...(toolContext.channelId
              ? { channelId: toolContext.channelId }
              : {}),
            ...(toolContext.channelName
              ? { channelName: toolContext.channelName }
              : {}),
            actor: {
              actorId: toolContext.userId,
              interfaceType: "mcp",
              role: "user",
            },
          },
        );

        return agentResponseToToolResponse(response);
      },
    },
  ];
}
