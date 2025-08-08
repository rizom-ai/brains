import type { PluginTool } from "@brains/plugins";
import type {
  IConversationMemoryService,
  SearchResult,
  ConversationContext,
} from "../types";
import { z } from "zod";

/**
 * Create MCP tools for conversation memory access
 */
export function createConversationTools(
  service: IConversationMemoryService,
  pluginId: string,
): PluginTool[] {
  return [
    {
      name: `${pluginId}:get_conversation_history`,
      description: "Get recent messages from the current conversation",
      inputSchema: {
        conversationId: z.string().describe("The conversation ID"),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Number of messages to retrieve"),
      },
      handler: async (
        input: unknown,
      ): Promise<{
        messages: Array<{ role: string; content: string; timestamp: string }>;
      }> => {
        const schema = z.object({
          conversationId: z.string(),
          limit: z.number().optional().default(20),
        });
        const { conversationId, limit } = schema.parse(input);
        const messages = await service.getRecentMessages(conversationId, limit);
        return {
          messages: messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
          })),
        };
      },
    },
    {
      name: `${pluginId}:search_conversations`,
      description: "Search across conversation summaries for a session",
      inputSchema: {
        sessionId: z.string().describe("The session ID to search within"),
        query: z.string().describe("The search query"),
      },
      handler: async (input: unknown): Promise<{ results: SearchResult[] }> => {
        const schema = z.object({
          sessionId: z.string(),
          query: z.string(),
        });
        const { sessionId, query } = schema.parse(input);
        const results = await service.searchConversations(sessionId, query);
        return { results };
      },
    },
    {
      name: `${pluginId}:get_conversation_context`,
      description: "Get context information about a conversation",
      inputSchema: {
        conversationId: z.string().describe("The conversation ID"),
      },
      handler: async (input: unknown): Promise<ConversationContext> => {
        const schema = z.object({
          conversationId: z.string(),
        });
        const { conversationId } = schema.parse(input);
        const context = await service.getConversationContext(conversationId);
        return context;
      },
    },
  ];
}
