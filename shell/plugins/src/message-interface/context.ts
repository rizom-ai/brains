import type { InterfacePluginContext } from "../interface/context";
import { createInterfacePluginContext } from "../interface/context";
import type { MessageRole, Message } from "@brains/conversation-service";
import type { IShell } from "../interfaces";

/**
 * Context interface for message interface plugins
 * Extends InterfacePluginContext with conversation management
 */
export interface MessageInterfacePluginContext extends InterfacePluginContext {
  // Conversation management - direct access to ConversationService
  startConversation: (
    sessionId: string,
    interfaceType: string,
    channelId: string,
  ) => Promise<string>;

  addMessage: (
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;

  getMessages: (
    conversationId: string,
    options?: { limit?: number },
  ) => Promise<Message[]>;
}

/**
 * Create a MessageInterfacePluginContext for a message interface plugin
 */
export function createMessageInterfacePluginContext(
  shell: IShell,
  pluginId: string,
): MessageInterfacePluginContext {
  // Start with interface context
  const interfaceContext = createInterfacePluginContext(shell, pluginId);

  return {
    ...interfaceContext,

    // Conversation management
    startConversation: async (
      sessionId: string,
      interfaceType: string,
      channelId: string,
    ): Promise<string> => {
      const conversationService = shell.getConversationService();
      const conversationId = await conversationService.startConversation(
        sessionId,
        interfaceType,
        channelId,
      );
      interfaceContext.logger.debug(`Started conversation ${conversationId}`, {
        sessionId,
        interfaceType,
      });
      return conversationId;
    },

    addMessage: async (
      conversationId: string,
      role: MessageRole,
      content: string,
      metadata?: Record<string, unknown>,
    ): Promise<void> => {
      const conversationService = shell.getConversationService();
      await conversationService.addMessage(
        conversationId,
        role,
        content,
        metadata,
      );
      interfaceContext.logger.debug(
        `Added message to conversation ${conversationId}`,
        {
          role,
          contentLength: content.length,
          hasMetadata: !!metadata,
        },
      );
    },

    getMessages: async (
      conversationId: string,
      options?: { limit?: number },
    ): Promise<Message[]> => {
      const conversationService = shell.getConversationService();
      return conversationService.getMessages(conversationId, options);
    },
  };
}
