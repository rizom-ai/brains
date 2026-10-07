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

    return this.readKnownConversation(conversation);
  }

  /**
   * The same read, for a caller that already holds the conversation.
   *
   * A survey hands back whole conversations, so asking for each one again by
   * id is a round trip for something already in hand. The hash stays here
   * rather than at the call site: a widget that computed it differently from
   * the projector would report every summary as stale forever.
   */
  public async readKnownConversation(
    conversation: Conversation,
  ): Promise<SummarySource> {
    const messages = await this.conversations.getMessages(conversation.id, {
      limit: this.config.maxSourceMessages,
    });

    return {
      conversation,
      messages,
      sourceHash: computeSummarySourceHash(
        conversation,
        messages,
        this.config.projectionVersion,
      ),
    };
  }
}

/** Shared provenance hash for runtime input selection, evals, and coverage. */
export function computeSummarySourceHash(
  conversation: Conversation,
  messages: Message[],
  projectionVersion: number,
): string {
  return computeContentHash(
    JSON.stringify({
      projectionVersion,
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
