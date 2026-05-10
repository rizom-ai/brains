import type {
  Conversation,
  EntityPluginContext,
  Message,
} from "@brains/plugins";
import { computeContentHash } from "@brains/utils/hash";
import type { SummaryConfig } from "../schemas/summary";

export interface SummarySource {
  conversation: Conversation;
  messages: Message[];
  sourceHash: string;
}

export class SummarySourceReader {
  constructor(
    private readonly context: EntityPluginContext,
    private readonly config: SummaryConfig,
  ) {}

  public async readConversation(
    conversationId: string,
  ): Promise<SummarySource> {
    const conversation = await this.context.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const messages = await this.context.conversations.getMessages(
      conversationId,
      { limit: this.config.maxSourceMessages },
    );

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
