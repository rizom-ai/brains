import type { Tool } from "@brains/mcp-service";
import { createTool } from "@brains/mcp-service";
import type { SystemServices } from "./types";
import {
  getConversationInputSchema,
  getMessagesInputSchema,
  listConversationsInputSchema,
} from "./schemas";

export function createConversationTools(services: SystemServices): Tool[] {
  const { conversationService } = services;

  return [
    createTool(
      "system",
      "get-conversation",
      "Get conversation details",
      getConversationInputSchema,
      async (input) => {
        const conv = await conversationService.getConversation(
          input.conversationId,
        );
        if (!conv)
          return {
            success: false,
            error: `Conversation not found: ${input.conversationId}`,
          };
        return {
          success: true,
          data: {
            id: conv.id,
            interfaceType: conv.interfaceType,
            channelId: conv.channelId,
            created: conv.created,
            lastActive: conv.lastActive,
          },
        };
      },
      { visibility: "public" },
    ),

    createTool(
      "system",
      "list-conversations",
      "List conversations, optionally filtered by search query",
      listConversationsInputSchema,
      async (input) => {
        const convs = await conversationService.searchConversations(
          input.searchQuery ?? "",
        );
        const limited = convs.slice(0, input.limit ?? 20);
        return {
          success: true,
          data: {
            conversations: limited.map((c) => ({
              id: c.id,
              interfaceType: c.interfaceType,
              channelId: c.channelId,
              created: c.created,
              lastActive: c.lastActive,
            })),
            totalFound: convs.length,
            returned: limited.length,
            searchQuery: input.searchQuery,
          },
        };
      },
      { visibility: "public" },
    ),

    createTool(
      "system",
      "get-messages",
      "Get messages from a specific conversation",
      getMessagesInputSchema,
      async (input) => {
        const msgs = await conversationService.getMessages(
          input.conversationId,
          { limit: input.limit ?? 20 },
        );
        return {
          success: true,
          data: {
            conversationId: input.conversationId,
            messages: msgs.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
            })),
            messageCount: msgs.length,
            requestedLimit: input.limit ?? 20,
          },
        };
      },
      { visibility: "public" },
    ),
  ];
}
