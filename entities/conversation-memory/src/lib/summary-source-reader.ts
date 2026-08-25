import {
  computeContentHash,
  type Conversation,
  type EntityConversationReader,
  type Message,
} from "@brains/sdk/entities";
import type { SummaryConfig } from "../schemas/summary-config";

export interface SummarySource {
  conversation: Conversation;
  messages: Message[];
  sourceHash: string;
}

export class SummarySourceReader {
  private readonly conversations: EntityConversationReader;
  private readonly config: SummaryConfig;
  constructor(conversations: EntityConversationReader, config: SummaryConfig) {
    this.conversations = conversations;
    this.config = config;
  }

  public async readConversation(
    conversationId: string,
  ): Promise<SummarySource> {
    const conversation = await this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const messages = await this.conversations.getMessages(conversationId, {
      limit: this.config.maxSourceMessages,
    });

    return {
      conversation,
      messages,
      sourceHash: this.computeSourceHash(conversation, messages),
    };
  }

  private computeSourceHash(
    conversation: Conversation,
    messages: Message[],
  ): string {
    return computeContentHash(
      JSON.stringify({
        projectionVersion: this.config.projectionVersion,
        conversation: {
          id: conversation.id,
          channelId: conversation.channelId,
          channelName: conversation.channelName,
          interfaceType: conversation.interfaceType,
          updatedAt: conversation.updatedAt,
        },
        messages: messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
        })),
      }),
    );
  }
}
